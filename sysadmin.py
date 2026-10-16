from flask import session, redirect, jsonify, request, g, abort, url_for
from flask_wtf.csrf import generate_csrf
from markupsafe import escape
from araxitravel_db import get_db
from dotenv import load_dotenv
from flask_babel import Babel, _, lazy_gettext as _l, gettext
from werkzeug.utils import secure_filename
from functools import wraps
from bs4 import BeautifulSoup
from datetime import datetime, date, timezone, timedelta
from urllib.parse import urlparse
from copy import deepcopy
import logging
import mysql.connector
from mysql.connector import pooling, Error
import os
import re
import random
import string
import time
import requests
import cssutils
import base64
import nh3
import json


def with_conn(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        conn = get_db()
        return f(conn, *args, **kwargs)
    return wrapper

load_dotenv()

# Determine the current script's directory
current_dir = os.path.dirname(os.path.abspath(__file__))

# Set the static folder path relative to the current script's directory
static_folder_path = os.path.join(current_dir, 'static')
target_directory = os.path.join(static_folder_path, 'images/quilljs')
os.makedirs(target_directory, exist_ok=True)

MAIN_CURRENCY = os.getenv('MAIN_CURRENCY')

# The most of one price that a single purchase may take (MAX_ALLOWED_QUANTITY in .env).
# Add to Store offers it as the stock's limit, and stock saved without a limit is capped at it
# everywhere a purchase is checked; otherwise the quantity dropdown lists every unit in stock
try:
    MAX_ALLOWED_QUANTITY = int(os.getenv('MAX_ALLOWED_QUANTITY', '20'))
except ValueError:
    MAX_ALLOWED_QUANTITY = 20
if MAX_ALLOWED_QUANTITY < 1:
    MAX_ALLOWED_QUANTITY = 20

def action_info():
    return session.get('action_info')

def pagination_items(page, total_pages, window):
    """
    Page numbers for a pagination bar, with None where pages are skipped ("…").
    Always shows the first and the last page plus `window` pages around the current one;
    a gap of a single page shows that page instead of "…".
    pagination_items(6, 120, 4) -> [1, None, 5, 6, 7, 8, None, 120]
    """
    window = max(1, int(window))
    page = min(max(1, int(page)), total_pages)

    start = max(1, page - (window - 1) // 2)
    end = min(total_pages, start + window - 1)
    start = max(1, end - window + 1)

    items = []
    prev = 0
    for p in sorted({1, total_pages, *range(start, end + 1)}):
        if p - prev == 2:
            items.append(p - 1)
        elif p - prev > 2:
            items.append(None)
        items.append(p)
        prev = p
    return items


def init_sysadmin_context(app):
    app.jinja_env.globals['pagination_items'] = pagination_items

    @app.context_processor
    def inject_action_info():
        # whatever keys you return here will be global in templates
        return {
            'actionInfo': action_info()
        }

@with_conn
def sqlSelect(
    conn,
    sqlQuery: str,
    sqlParams: tuple | None = None,
    as_dict: bool = False
):
    """
    Execute a SELECT query and return rows, row‐count, and any error.
    Connections are returned to the pool automatically via Flask’s teardown.
    """
    # conn = get_db()
    cursor = conn.cursor(dictionary=as_dict)
    try:
        cursor.execute(sqlQuery, sqlParams or ())
        rows = cursor.fetchall()
        return {
            "data": rows,
            "length": len(rows),
            "error": None
        }
    except Error as e:
        logging.exception("Failed to execute SELECT")
        return {
            "data": [],
            "length": 0,
            "error": str(e)
        }

@with_conn
def sqlInsert(
    conn,
    sqlQuery: str,
    sqlParams: tuple | None = None
) -> dict:
    """
    Execute an INSERT statement and return status, inserted_id, and rows_affected.
    """
    # conn = get_db()
    params = sqlParams or ()
    status = 0

    try:
        # 1) Use a context-manager so the cursor is always closed
        with conn.cursor() as cursor:
            cursor.execute(sqlQuery, params)
            conn.commit()

            rows = cursor.rowcount
            new_id = cursor.lastrowid

        # 2) Build a clear, typed response
        if rows > 0:
            msg = gettext(
                "Inserted successfully, %(count)d rows affected.", count=rows
            )
            status = 1
        else:
            msg = gettext(
                "Query executed successfully, but no rows were affected."
            )
            status = 1

        return {
            "status": status,               
            "answer": msg,
            "inserted_id": new_id,
            "rows_affected": rows,
        }

    except mysql.connector.Error as err:
        # 3) Roll back on any DB error, and log the full stack
        conn.rollback()
        logging.exception("Failed to execute INSERT")
        return {
            "status": 0,
            # callers send 'answer' to the browser, so it must not contain the MySQL error (logged above)
            "answer": gettext('Something went wrong. Please try again!'),
            "message": gettext("An error occurred: %(error)s", error=str(err)),
            "inserted_id": None,
            "rows_affected": 0,
        }

@with_conn
def sqlUpdate(conn, sqlQuery, sqlValuesTuple=''):
    # Update the content from the MySQL database
    # db_connection = get_db()
    db_connection = conn
    rows_affected = None
    status = '-1'
    try:
        with db_connection.cursor() as cursor:
            cursor.execute(sqlQuery, sqlValuesTuple)
            
            # Commit the transaction
            db_connection.commit()
            
            # Check how many rows were affected
            rows_affected = cursor.rowcount

            # Close the cursor
            # cursor.close()
            
            # Check if rows were affected
            if rows_affected > 0:
                answer = f"Query executed successfully, {rows_affected} rows affected."
                status = '1'
                # answer = gettext('Done!')
            else:
                answer = "Query executed successfully, but no rows were affected."
                status = '1'

    except Exception as e:
        db_connection.rollback()
        logging.exception("Failed to execute update query")
        answer = f"An error occurred: {e}"
    # finally:
    #     db_connection.close()        # returns to pool now
    #     g.pop("db_conn", None)       # so teardown doesn’t double-close it

    return {'status': status, 'answer': answer, 'rows_affected': rows_affected}


@with_conn
def sqlDelete(conn, sqlQuery, sqlValuesTuple):
    
    try:
        # Get a connection from the pool
        # conn = get_db()
        cursor = conn.cursor()
        
        # Execute the DELETE statement
        cursor.execute(sqlQuery, sqlValuesTuple)
        
        # Commit the transaction
        conn.commit()
        
        answer = "Record deleted successfully"
        status = '1'
    except mysql.connector.Error as err:
        answer = f"An error occurred: {err}"
        status = '-1'

    finally:
        # Close the cursor and connection
        if cursor:
            cursor.close()
        # if conn:
        #     conn.close()

    return {'status': status, 'answer': answer}


def getLangID():

    defLang = getDefLang()
    langID = defLang['id']

    currentLangPrefix = session.get('lang', defLang['Prefix'])
    supportedLangs = supported_langs()
    for lang in supportedLangs:
        if currentLangPrefix == lang['Prefix']:
            langID = lang['Language_ID']
   
    return langID


def getLangdata(Prefix):

    content = {}
    supportedLangs = supported_langs()
    for lang in supportedLangs:
        if Prefix == lang['Prefix']:
            content['ID'] = lang['Language_ID']
            content['Language'] = lang['Language']
            content['Prefix'] = lang['Prefix']

    return content


def get_pc_ref_key(pc_id):
    sqlQuery = "SELECT `PC_Ref_Key` FROM `product_c_relatives` WHERE `PC_ID` = %s"
    sqlValTuple = (pc_id,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        for val in result['data']:
            if val['PC_Ref_Key'] > 0:
                return val['PC_Ref_Key']
    else:
        return False
    

def get_ac_ref_key(pc_id):
    sqlQuery = "SELECT `AC_Ref_Key` FROM `article_c_relatives` WHERE `AC_ID` = %s"
    sqlValTuple = (pc_id,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        for val in result['data']:
            if val['AC_Ref_Key'] > 0:
                return val['AC_Ref_Key']
    else:
        return False


def  get_pc_id_by_lang(pcRefKey):
    sqlQuery = "SELECT `PC_ID` FROM `product_c_relatives` WHERE `PC_Ref_Key` = %s AND Language_ID = %s"
    langID = getLangID()
    sqlValTuple = (pcRefKey, langID)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        return result['data'][0]['PC_ID']
    else:
        return False


def  get_ac_id_by_lang(pcRefKey):
    sqlQuery = "SELECT `AC_ID` FROM `article_c_relatives` WHERE `AC_Ref_Key` = %s AND Language_ID = %s"
    langID = getLangID()
    sqlValTuple = (pcRefKey, langID)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        return result['data'][0]['AC_ID']
    else:
        return False

# Get product id by language
def  get_pr_id_by_lang(RefKey, langID):
    sqlQuery = "SELECT `P_ID` FROM `product_relatives` WHERE `P_Ref_Key` = %s AND Language_ID = %s"
    sqlValTuple = (RefKey, langID)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        return result['data'][0]['P_ID']
    else:
        return False

# Get article id by language
def  get_ar_id_by_lang(RefKey, langID):
    sqlQuery = "SELECT `A_ID` FROM `article_relatives` WHERE `A_Ref_Key` = %s AND Language_ID = %s"
    sqlValTuple = (RefKey, langID)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        return result['data'][0]['A_ID']
    else:
        return False


# Check if product name exists
def pr_name_check(productName, languageID, productID): 
    myResponse = {'status': '0'}
    update = ''
    sqlQueryCheck3Val = (productName, languageID)

    if productID is not None:
        update = ' AND `ID` != %s'
        sqlQueryCheck3Val = (productName, languageID, productID)
    
    sqlQueryCheck3 = f"""SELECT `ID` FROM `product` WHERE `Title` = %s  AND Language_ID = %s {update}"""
    result3 = sqlSelect(sqlQueryCheck3, sqlQueryCheck3Val, True)

    if result3['length'] > 0:
        myResponse['status'] = '1'    
        myText = f"""'{productName}' Product Exists!"""
        myResponse['answer'] = gettext(myText)    

    return myResponse


# Check if article name exists
def ar_name_check(productName, languageID, productID): 
    myResponse = {'status': '0'}
    update = ''
    sqlQueryCheck3Val = (productName, languageID)

    if productID is not None:
        update = ' AND `ID` != %s'
        sqlQueryCheck3Val = (productName, languageID, productID)
    
    sqlQueryCheck3 = f"""SELECT `ID` FROM `article` WHERE `Title` = %s  AND Language_ID = %s {update}"""
    result3 = sqlSelect(sqlQueryCheck3, sqlQueryCheck3Val, True)

    if result3['length'] > 0:
        myResponse['status'] = '1'    
        myText = f"""'{productName}' Article Exists!"""
        myResponse['answer'] = gettext(myText)    

    return myResponse

# Check if product link exists
def pr_url_check(productLink, languageID, productID):
    myResponse = {'status': '0'}
    update = ''
    sqlQueryCheck5Val = (productLink, languageID)
    
    if productID is not None:
        update = ' AND `ID` != %s'
        sqlQueryCheck5Val = (productLink, languageID, productID)

    sqlQueryCheck5 = f"""SELECT `ID` FROM `product` WHERE `Url` = %s AND Language_ID = %s {update}"""
    result5 = sqlSelect(sqlQueryCheck5, sqlQueryCheck5Val, True)

    if result5['length'] > 0:
        myResponse['status'] = '1'   
        myText = f"""'{productLink}' Link Exists!"""
        myResponse['answer'] = gettext(myText)  
    
    return myResponse


# Check if product link exists
def ar_url_check(productLink, languageID, productID):
    myResponse = {'status': '0'}
    update = ''
    sqlQueryCheck5Val = (productLink, languageID)
    
    if productID is not None:
        update = ' AND `ID` != %s'
        sqlQueryCheck5Val = (productLink, languageID, productID)

    sqlQueryCheck5 = f"""SELECT `ID` FROM `article` WHERE `Url` = %s AND Language_ID = %s {update}"""
    result5 = sqlSelect(sqlQueryCheck5, sqlQueryCheck5Val, True)

    if result5['length'] > 0:
        myResponse['status'] = '1'   
        myText = f"""'{productLink}' Link Exists!"""
        myResponse['answer'] = gettext(myText)  
    
    return myResponse


def fileUpload(file, uploadDir):
   
    # uploadDir = 'images/thumbnails'
    # Save the file
    unique_filename = ''
    if file:
        # Split the filename into name and extension
        upload_to = os.path.join(static_folder_path, uploadDir)
        filename = secure_filename(file.filename)
        
        # name, ext = os.path.splitext(filename)
        file_path = os.path.join(upload_to, filename)
        
        unique_filename = filename
        
       # Check if the filename exists and create a unique filename if it does
        while os.path.exists(file_path):
            name, ext = os.path.splitext(filename)
            if '_' in name: # Check if the name contains an underscore
                arr = name.rsplit('_', 1)  # Split the name from the last underscore
                if arr[-1].isdigit(): # Check if the part after the underscore is a digit
                    # Increment the number and create a new unique filename
                    last_num = int(arr[-1]) + 1
                    unique_filename = f"{arr[0]}_{last_num}{ext}"
                   
                else:
                    unique_filename = f"{name}_1{ext}" # Append '_1' to the name to create a new unique filename
            else:
                unique_filename = f"{name}_1{ext}"  # Append '_1' to the name to create a new unique filename
            
            filename = unique_filename
            
            # Update the file path with the new unique filename
            file_path = os.path.join(upload_to, unique_filename)
            
        file.save(file_path)

    return unique_filename


def removeRedundantFiles(fileName, fileDir):
   
    # fileDir = 'images/thumbnails'
    # fileName = 'photo.jpg'

    # Create path to the file
    remove_from = safe_static_path(fileDir, fileName)

    if remove_from and os.path.isfile(remove_from):
        os.remove(remove_from)
        return True
    else:
        return False


def checkForRedundantFiles(fileName, colonName, tableName):

    sqlQuery = f"""SELECT  {colonName} FROM {tableName} WHERE {colonName} = %s; """
    sqlValTuple = (fileName,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)

    if result['length'] > 1:
        return True
    else:
        return False     


def getFileName(colonName, tableName, idName, idVal):
    sqlQuery = f"""SELECT {colonName} FROM {tableName} WHERE {idName} = %s;"""
    sqlValTuple = (idVal,)
    row = sqlSelect(sqlQuery, sqlValTuple, True)

    if row['length'] > 0 and row['data'][0][colonName] is not None:
        if len(row['data'][0][colonName]) > 0:
            return row['data'][0][colonName]
        else:
            return None
    else:
        return None
    

def get_meta_tags(content):
    ImageUrl = os.path.join(static_folder_path, 'static', content['ImageUrl'])

    # Title and descriptions are typed by staff, so every value is escaped
    # before it goes into an attribute or the JSON-LD script block.
    title = escape(content['Title'])
    description = escape(content['ShortDescription'] or '')
    url = escape(content['Url'])
    siteName = escape(content['SiteName'])

    # Facebook and instagram metatags
    metaMetaTags = f"""
        <meta property="og:title" content="{title}" />
        <meta property="og:description" content="{description}" />
        <meta property="og:image" content="{escape(ImageUrl)}" />
        <meta property="og:url" content="{url}" />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="{url}" />
        <meta property="og:site_name" content="{siteName}" />
    """

    # Google metatags
    date_published = 0 
    date_modified = 0

    if content['DatePublished'] is None:
        content['DatePublished'] = 0   
    elif content['DateModified'] is None:
        content['DateModified'] = 0   
    elif content['DatePublished'] > content['DateModified']:
        date_published = content['DatePublished'] 
        date_modified = content['DatePublished']
    else:
        date_published = content['DatePublished'] 
        date_modified = content['DateModified']

    structuredData = {
        "@context": "https://schema.org",
        "@type": "Product",
        "headline": content['Title'],
        "description": content['ShortDescription'],
        "image": ImageUrl,
        "datePublished": str(date_published),
        "dateModified": str(date_modified),
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": content['Url']
        }
    }
    # "<", ">" and "&" are escaped so a value can never close the <script> element
    structuredJson = (json.dumps(structuredData, ensure_ascii=False, indent=8)
                      .replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026'))

    googleMetaTags = f"""
        <script type="application/ld+json">
        {structuredJson}
        </script>
    """

    metaTags = metaMetaTags + googleMetaTags
    return metaTags


# ── Request hygiene ──────────────────────────────────────────────────────────
# What protects us from what:
#   * SQL injection  -> every value goes to MySQL as a %s parameter (sqlSelect & co.)
#   * XSS            -> Jinja autoescaping, escapeHtml() in templates' JS,
#                       and sanitize_html() for the rich text coming from Quill
#   * Path traversal -> secure_filename() + safe_static_path()
# validate_request() adds input hygiene on top of that. It rejects values that are
# never legitimate in their field instead of blocking ordinary words, so a customer
# can write "please update my booking" or "select the second date".

# Fields that legitimately carry HTML (Quill editor). They are sanitized with
# sanitize_html() before being stored, so markup is allowed here.
RICH_TEXT_FIELDS = {'content'}
IGNORED_FIELDS = {'cf-turnstile-response'}
MAX_FIELD_LENGTH = 50000

# ASCII control characters except tab, newline and carriage return
CONTROL_CHARS = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
# Markup in a plain-text field: "<" immediately followed by a tag name, "/", "!" or "?"
# (browsers only start a tag that way). "a < b", "<3" and "5<6" are still accepted.
HTML_TAG = re.compile(r'<[a-zA-Z!/?]')

ALLOWED_IMAGE_TYPES = {"jpeg", "png"}


def is_valid_base64_image(value: str) -> bool:
    """Checks if the base64 string is a valid JPEG or PNG image."""
    try:
        if ',' in value:
            _, value = value.split(',', 1)  # Remove data URI prefix if present
        decoded = base64.b64decode(value, validate=True)
        is_jpeg = decoded.startswith(b"\xff\xd8\xff")
        is_png = decoded.startswith(b"\x89PNG\r\n\x1a\n")
        return (is_jpeg and "jpeg" in ALLOWED_IMAGE_TYPES) or (is_png and "png" in ALLOWED_IMAGE_TYPES)
    except (ValueError, TypeError):
        return False


def find_invalid_value(key, value):
    """Returns a user-facing error message for an unacceptable value, or None."""
    if CONTROL_CHARS.search(value):
        return gettext('Something went wrong. Please try again!')

    if key in RICH_TEXT_FIELDS:
        return None

    if len(value) > MAX_FIELD_LENGTH and not is_valid_base64_image(value):
        return gettext('The text is too long.')

    if HTML_TAG.search(value):
        return gettext('Please remove HTML tags (text in angle brackets) from your input.')

    return None


def reject_request(message):
    # XHR handlers across the templates display `answer` when status is '0' and
    # only read 200 responses, so POSTs get a readable message instead of an error page.
    if request.method == 'GET':
        abort(400, description=message)
    return jsonify({'status': '0', 'answer': message, 'newCSRFtoken': generate_csrf()})


def validate_request(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        for key, values in request.values.lists():
            if key in IGNORED_FIELDS:
                continue
            for value in values:
                if isinstance(value, str):
                    message = find_invalid_value(key, value)
                    if message:
                        return reject_request(message)

        # URL path segments (e.g. /affiliate/<affID>, /orders/<filter>) end up in templates too
        for value in (request.view_args or {}).values():
            if isinstance(value, str) and (CONTROL_CHARS.search(value) or HTML_TAG.search(value)):
                return reject_request(gettext('Something went wrong. Please try again!'))

        return f(*args, **kwargs)
    return wrapper


# Rich text (Quill) sanitizer: everything not listed here is removed
SANITIZE_TAGS = {
    'p', 'br', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
    'a', 'img', 'ol', 'ul', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
}
SANITIZE_ATTRIBUTES = {
    '*': {'class', 'style'},
    'a': {'href', 'target'},
    'img': {'src', 'alt', 'width', 'height'},
    'ul': {'data-checked'},
    'pre': {'spellcheck'},
}
SANITIZE_STYLE_PROPERTIES = {
    'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'text-decoration', 'text-align', 'line-height', 'margin', 'margin-top', 'margin-bottom',
    'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left',
    'padding-right', 'width', 'max-width', 'height', 'border', 'border-radius', 'display',
    'list-style-type', 'vertical-align', 'white-space',
}
SANITIZE_URL_SCHEMES = {'http', 'https', 'mailto', 'tel'}


def sanitize_html(html):
    """Strips scripts, event handlers, javascript: URLs and unknown tags from rich text."""
    if not html:
        return html
    return nh3.clean(
        html,
        tags=SANITIZE_TAGS,
        attributes=SANITIZE_ATTRIBUTES,
        filter_style_properties=SANITIZE_STYLE_PROPERTIES,
        url_schemes=SANITIZE_URL_SCHEMES,
    )


# Slide title/subtitle formatting (home_slide.Title_Format / Subtitle_Format): a JSON list of
# runs that together spell the plain text, e.g.
#   [{"t": "Discover ", "c": "#3498db", "b": 1}, {"t": "Armenia", "i": 1, "u": 1}]
# t = text, b/i/u = bold/italic/underline, c = colour. Rendered with textContent, never as HTML.
TEXT_FORMAT_COLOR = re.compile(
    r'^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$')
TEXT_FORMAT_MAX_RUNS = 300


def sanitize_text_format(raw, text):
    """Returns the cleaned runs as compact JSON, or None when there is no formatting or the
    runs do not spell exactly `text` (the slide then shows the plain text)."""
    if not raw or not text:
        return None
    try:
        runs = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(runs, list) or len(runs) > TEXT_FORMAT_MAX_RUNS:
        return None

    clean = []
    for run in runs:
        if not isinstance(run, dict) or not isinstance(run.get('t'), str) or not run['t']:
            return None
        item = {'t': run['t']}
        for key in ('b', 'i', 'u'):
            if run.get(key):
                item[key] = 1
        color = run.get('c')
        if isinstance(color, str) and TEXT_FORMAT_COLOR.match(color.strip()):
            item['c'] = color.strip()
        # merge neighbours with the same formatting
        if clean and {k: v for k, v in clean[-1].items() if k != 't'} == {k: v for k, v in item.items() if k != 't'}:
            clean[-1]['t'] += item['t']
        else:
            clean.append(item)

    if ''.join(run['t'] for run in clean) != text:
        return None
    if all(len(run) == 1 for run in clean):    # text only, nothing formatted
        return None
    return json.dumps(clean, ensure_ascii=False, separators=(',', ':'))


def safe_static_path(fileDir, fileName):
    """Joins a path under /static and returns None if it would escape that folder."""
    path = os.path.realpath(os.path.join(static_folder_path, fileDir, fileName))
    if not path.startswith(os.path.realpath(static_folder_path) + os.sep):
        return None
    return path


def session_expired():
    now = datetime.now(timezone.utc)
    elapsed = now - session['started_at']
    return elapsed > timedelta(minutes=session['exp_minutes'])



def login_required(f):
    """
    Decorate routes to require login.

    http://flask.pocoo.org/docs/0.12/patterns/viewdecorators/
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None or session.get('started_at') == None:
            session.clear()
            return redirect("/login")
        
        if session_expired() == True:
            session.clear()
            return redirect("/login")
        
        userID = session.get("user_id")
        Action = f.__name__

        exeptionActions = ['stuff', 'login', 'logout']

        if Action not in exeptionActions:
            if permissions(userID, Action) == False:
                return redirect("/login")
        
        session['started_at'] = datetime.now(timezone.utc)
        return f(*args, **kwargs)
    
    return decorated_function


def permissions(stuffID, Action):
    sqlQuery =  """
                SELECT 
                    `actions`.`Action`,
                    `actions`.`ActionName`,
                    `rol`.`Rol`
                FROM `actions` 
                    LEFT JOIN `rol` ON find_in_set(`actions`.`ID`, `rol`.`actionIDs`)
                    LEFT JOIN `position` ON find_in_set(`rol`.`ID`, `position`.`rolIDs`)
                    LEFT JOIN `stuff` ON `stuff`.`PositionID` = `position`.`ID`
                WHERE `stuff`.`ID` = %s AND `stuff`.`Status` = 1
                """
    sqlValTuple = (stuffID,)
    result = sqlSelect(sqlQuery, sqlValTuple, False)
    if result['length'] == 0:
        session.clear()
        return False
    
    for actionTuple in result['data']:
        if actionTuple[0] == Action:
            session['action_info'] = {'actionName': actionTuple[1], 'role': actionTuple[2]}
            action_info()
            return True
        
    return False

def generate_random_string():
    length = random.randint(35, 40)
    characters = string.ascii_letters + string.digits
    random_string = ''.join(random.choice(characters) for _ in range(length))
    return random_string


def generate_random_unique_string(table):
    randomStr = generate_random_string()
    sqlQuery = f"SELECT `Url` FROM {table} WHERE `Url` = %s;"
    sqlValTuple = (randomStr,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    while result['length'] > 0:
        randomStr = generate_random_string()
        sqlQuery = f"SELECT `Url` FROM {table} WHERE `Url` = %s;"
        sqlValTuple = (randomStr,)
        result = sqlSelect(sqlQuery, sqlValTuple, True)
    
    return randomStr



def get_full_website_name():
    # Get the scheme (http or https)
    scheme = request.scheme
    # Get the host (including www if present)
    host = request.host
    # Combine them to get the full URL
    full_website_name = f"{scheme}://{host}"
    return full_website_name


def dataModified(articleID):

    sqlQuery = "UPDATE `article` SET `DateModified` = CURDATE() WHERE `ID` = %s"
    sqlUpdateVal = (articleID,)
    result = sqlUpdate(sqlQuery, sqlUpdateVal)

    if result['status'] == '1':
        return True
    else:
        return False


def supportedLangsValues():   
    
    supportedLangsData = supported_langs()
    if len(supportedLangsData) > 1:
        for prefix in supported_langs:
            supportedLangsData.append(getLangdata(prefix))
    else:
        supportedLangsData = getLangdata(supported_langs[0])

    return supportedLangsData

def getDefLang():
    defLang = {'id': 1, 'Prefix': 'hy', 'Language': 'Հայերեն'}
    # defLang = {'id': 2, 'Prefix': 'en', 'Language': 'English'}
    return defLang


def getSupportedLangsPrefixes():
    arr = supported_langs()
    return [lang['Prefix'] for lang in arr] # ['en', 'hy', 'ru']

def getSupportedLangIDs():
    arr = supported_langs()
    return [lang['Language_ID'] for lang in arr]

def supported_langs():
    arr = [
            {'Language_ID': 1, 'Language': 'Հայերեն', 'Prefix':	'hy', 'Flag': 'am.svg'},
            {'Language_ID': 2, 'Language': 'English', 'Prefix':	'en', 'Flag': 'gb.svg'},
            {'Language_ID': 3, 'Language': 'Русский', 'Prefix':	'ru', 'Flag': 'ru.svg'}
          ]
    return arr


def getLangdatabyID(langID):
    if not isinstance(langID, int):
        langID = int(langID)
        
    supportedLangs = supported_langs()
    content = []
    for lang in supportedLangs:
        if lang['Language_ID'] == langID:
            content = lang  
            
    return content

    
def getUserID():
    return session.get('user_id', None)

def replace_spaces_in_text_nodes(html_content):
    def replace_spaces(match):
        text = match.group(1)
        # Replace only sequences of two or more spaces with the corresponding number of non-breaking spaces
        return re.sub(r' {2,}', lambda m: '&nbsp;' * len(m.group(0)), text)
    
    # Regex explanation:
    # 1. `>([^<]+)<` matches text content between any tags.
    # 2. `re.DOTALL` allows the `.` to match newlines as well.
    return re.sub(r'>([^<]+)<', lambda m: f">{replace_spaces(m)}<", html_content, flags=re.DOTALL)

# Dicts inside a list, tuple, set
def filter_multy_dict(data, filter):
    arr = set()
    
    for val in data:
        arr.add(val.get(filter, None))

    return arr


def totalNumRows(tableName, where='', sqlValTuple=()):
    sqlQuery = f""" SELECT * FROM {tableName} {where};"""
    # sqlValTuple = ()
    result = sqlSelect(sqlQuery, sqlValTuple, True)

    return result['length']


def countRows(fromClause, where='', sqlValTuple=(), distinctColumn=None):
    """
    Number of rows a paginated listing returns, for its page links.
    fromClause / where / sqlValTuple must be exactly what the listing query uses
    (same JOINs and WHERE parameters), otherwise filtered counts fail or differ.
    distinctColumn: pass the GROUP BY column for listings that group rows.
    """
    counted = f'COUNT(DISTINCT {distinctColumn})' if distinctColumn else 'COUNT(*)'
    sqlQuery = f"SELECT {counted} AS `numRows` FROM {fromClause} {where};"
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] == 0:
        return 0
    return result['data'][0]['numRows']




def generate_pagination_urls(page, numRows, pagination):
    urls = {
        "prev": None,
        "pages": [],
        "next": None
    }
    
    # Calculate the total number of pages
    total_pages = (numRows // pagination) + ( (numRows % pagination) // (numRows % pagination) )
    
    # Generate the URL for the previous page if page > 1
    if page > 1:
        url_prev = f"{url_for('team', _external=True)}/{page - 1}"
        urls["prev"] = url_prev
    
    # Generate URLs for each page
    for i in range(1, total_pages + 1):
        url_page = f"{url_for('team', _external=True)}/{i}"
        urls["pages"].append({
            "url": url_page,
            "active": (i == page)
        })
    
    # Generate the URL for the next page if page < total_pages
    if page < total_pages:
        url_next = f"{url_for('team', _external=True)}/{page + 1}"
        urls["next"] = url_next
    return urls


def checkSPSSDataLen(spsID, languageID):
    if request.form.get('spsID'):
        longData = 0
        spssAnswer = ""
        sqlQuerySPS = """
        SELECT 
            `sub_product_specification`.`ID`,
            `sub_product_specification`.`Name`,
            `sub_product_specifications`.`Name` AS `Text`,
            `sub_product_specifications`.`ID` AS `spssID`,
            `sub_product_specifications`.`Status` AS `spssStatus`
        FROM `sub_product_specification`
            LEFT JOIN `sps_relatives` ON `sps_relatives`.`SPS_ID` = `sub_product_specification`.`ID` 
            LEFT JOIN `sub_product_specifications` ON `sub_product_specifications`.`spsID` = `sub_product_specification`.`ID`
        WHERE `sps_relatives`.`Language_ID` = %s AND `sub_product_specification`.`ID` = %s
        ORDER BY `sub_product_specifications`.`Order`;
        """
        sqlValTupleSPS = (languageID, spsID)
        resultSPS = sqlSelect(sqlQuerySPS, sqlValTupleSPS, True)

        for row in resultSPS['data']:
            if request.form.get(str(row['spssID'])):
                Text = request.form.get(str(row['spssID']))
                
                if len(Text) > 255:
                    longData = 1
                    spssAnswer = spssAnswer + gettext('Text is too long for field ') + row['Text'] + '.<br/>'
        return [longData, spssAnswer]


def clientID_contactID(data): # returns clientID from table `clients` and contactID from table `client_contacts` 
    clientID, phoneID, emailID, addressID = [None, None, None, None]
   
    sqlQuery = "SELECT * FROM `clients` WHERE `Firstname` = %s AND `Lastname` = %s;"
    result = sqlSelect(sqlQuery, (data['firstname'].strip(), data['lastname'].strip()), True)
    if result['length'] > 0:
        clientID = result['data'][0]['ID']
    else:
        sqlQueryInsert = "INSERT INTO `clients` (`Firstname`, `Lastname`) VALUES (%s, %s);"
        sqlQueryTuple = (data['firstname'].strip(), data['lastname'].strip())
        result = sqlInsert(sqlQueryInsert, sqlQueryTuple)
        clientID = result['inserted_id']

        
    if data.get('email'):
        sqlQuery = "SELECT * FROM `emails` WHERE `email` = %s;"
        result = sqlSelect(sqlQuery, (data['email'].strip(),), True)
        if result['length'] > 0:
            email = data['email']
            emailID = result['data'][0]['ID']

    phone = data['phone'].strip()

    # Remove all parentheses, hyphens, spaces and 0 at the beggining
    phone = re.sub(r'[()\-\s]', '', phone)
    phone = re.sub(r'^0', '', phone)

    sqlQuery = "SELECT * FROM `phones` WHERE `phone` = %s;"
    result = sqlSelect(sqlQuery, (phone.strip(),), True)
    if result['length'] > 0:
        phoneID = result['data'][0]['ID']
    else:
        sqlInsertPhone = "INSERT INTO `phones` (`phone`, `clientID`) VALUES (%s, %s);"
        result = sqlInsert(sqlInsertPhone, (phone, clientID))
        phoneID = result['inserted_id']

    if data.get('email') and emailID == None:
        sqlQueryInsert = "INSERT INTO `emails` (`email`, `clientID`) VALUES (%s, %s);"
        sqlQueryTuple = (data['email'].strip(), clientID)
        result = sqlInsert(sqlQueryInsert, sqlQueryTuple)
        emailID = result['inserted_id']

    
    sqlQueryContacts = "SELECT * FROM `client_contacts` WHERE `emailID` = %s AND `phoneID` = %s"
    sqlValTuple = (emailID, phoneID)
    result = sqlSelect(sqlQueryContacts, sqlValTuple, True)
    if result['length'] > 0:
        contactID = result['data'][0]['ID']
    else:
        sqlQueryInsert = "INSERT INTO `client_contacts` (`emailID`, `phoneID`) VALUES (%s, %s);"
        sqlValTuple = (emailID, phoneID)
        result = sqlInsert(sqlQueryInsert, sqlValTuple)
        contactID = result['inserted_id']

    return {'clientID': clientID, 'contactID': contactID}


def get_promo_code_id_affiliateID(promo):
    sqlQuery = """
                    SELECT 
                        `promo_code`.`ID`,
                        `stuff`.`ID` AS `affiliateID`      
                    FROM `promo_code`
                        LEFT JOIN `stuff` ON `stuff`.`ID` = `promo_code`.`affiliateID`
                    WHERE `promo_code`.`Promo` = %s AND `promo_code`.`Status` = 1 AND `promo_code`.`expDate` >= CURRENT_DATE()      
                ;"""
    result = sqlSelect(sqlQuery, (promo,), True)
    if result['length'] > 0:
        return result['data'][0]
    else:
        return False

def get_create_email_id(email):
    sqlQuery = "SELECT `ID` FROM `emails` WHERE `email` = %s;"
    result = sqlSelect(sqlQuery, (email,), True)
    if result['length'] > 0:
        return result['data'][0]['ID']
    else:
        sqlQueryInsert = "INSERT INTO `emails` (`email`) VALUES (%s);"
        result = sqlInsert(sqlQueryInsert, (email,))    
        return result['inserted_id']
    

def calculate_price_promo(products, promo):
    
    if promo != '':
        # check products and promo validity 
        ptIDs = ''
        for row in products:
            ptIDs = ptIDs + str(row['ptID']) + ','

        ptIDs = ptIDs[:-1]    
        sqlQuery =  """
                    SELECT 
                        `product_type`.`ID` AS `ptID`,
                        `product_type`.`Price`,
                        `discount`.`discount`
                        -- `discount`.`discount_status`
                    FROM `promo_code` 
                        LEFT JOIN `discount` ON `discount`.`promo_code_id` = `promo_code`.`ID`
                        LEFT JOIN `product_type` ON `product_type`.`ID` = `discount`.`ptID`
                        LEFT JOIN `product` ON `product`.`ID` = `product_type`.`Product_ID`
                    WHERE `promo_code`.`Promo` = %s 
                        AND `promo_code`.`expDate` >= CURRENT_DATE() 
                        AND `promo_code`.`Status` = 1
                        AND `product`.`Product_Status` = 2
                        AND FIND_IN_SET(`product_type`.`ID`, %s)
                        AND `discount`.`Status` = 1
                    """
        sqlValTuple = (promo, ptIDs)
        # sqlValTuple = (promo, ptIDs)
        result = sqlSelect(sqlQuery, sqlValTuple, True)
        if result['length'] == 0:
            return {'status': "0", 'answer': "Invalid Promo Code"}

        # Deside prices with discount
        discountPrice = 0
        for row in result['data']:
            for r in products:
                if row['ptID'] == r['ptID']:
                    discountPrice = discountPrice + (row['Price'] * int(r['quantity']) * row['discount'] / 100)
        
        return {'status': "1", 'answer': discountPrice}

    else:
        return calculate_price(products)    
   

def calculate_price(products):
    ptIDs = ''
    for row in products:
        ptIDs = ptIDs + str(row['ptID']) + ','

    ptIDs = ptIDs[:-1]    
    sqlQuery =  """
                SELECT 
                    `product_type`.`ID` AS `ptID`,
                    `product_type`.`Price`                    
                FROM `product_type`
                WHERE find_in_set(`product_type`.`ID`, %s)
                    
                """
    sqlValTuple = (ptIDs,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] == 0:
        return {'status': "2"}

    # Calculate total price prices with discount
    # This part works incorrectly
    # !!!!!!!!!!!!!!!!!!!!!!!!!!!!
    totalPrice = 0
    for row in result['data']:
        for r in products:
            if row['ptID'] == r['ptID']:
                totalPrice = totalPrice + row['Price'] * int(r['quantity'])
    # !!!!!!!!!!!!!!!!!!!!!!!!!!!!
    return {'status': "1", 'answer': totalPrice}


# priceOverrides: {ptRefKey: price of one unit} instead of product_type.Price (a booking's price, booking.py)
def insertIntoBuffer(data, pdID, smthWrong, languageID, paymentMethod, priceState, priceOverrides=None):
    # IMPORTANT
    # Do not forget to take into consideration the max quantity as well
        
    if paymentMethod and priceState == True:
        # Check credentials for credit/debit card
        if paymentMethod == '1':
            if not data['cc-name']:
                return {'status': '3', 'answer': gettext("Name on card is required.")}
            if not data['cc-number']:
                return {'status': '3', 'answer': gettext("Credit card number is required.")}
            if not data['cc-expiration']:
                return {'status': '3', 'answer': gettext("Expiration date required.")}
            if not data['cc-cvv']:
                return {'status': '3', 'answer': gettext("Security code required.")}
        

    bufferQuantities = []
    ptIDs = ''

    for row in data['ptData']:
        ptIDs = ptIDs + str(row['ptID']) + ','

    ptIDs = ptIDs[:-1]    
    sqlQuaryStore = f"""
                    SELECT 
                        `quantity`.`ID` AS `quantityID`,
                        `quantity`.`Quantity`,
                        `quantity`.`maxQuantity`,
                        (SELECT SUM(q.`Quantity`) FROM `quantity` `q`
                            WHERE find_in_set(`q`.`ptRefKey`, `quantity`.`ptRefKey`)
                        AND `Status` = '1'
                        AND `expDate` >= CURDATE()) AS `totalQuantity`,
                        -- `product_type`.`ID` AS `ptID`,
                        `product_type_relatives`.`PT_Ref_Key` AS `ptID`,
                        `product_type`.`Price`,
                        `promo_code`.`Promo`,
                        `promo_code`.`ID` AS `promoID`,
                        `discount`.`discount`,
                        `discount`.`revard_value`,
                        `discount`.`revard_type`,
                        `stuff`.`ID` AS `affiliateID`
                    FROM `quantity` 
                        LEFT JOIN `store` ON `store`.`ID` = `quantity`.`storeID`
                        LEFT JOIN `product_type_relatives` ON `product_type_relatives`.`PT_Ref_Key` = `quantity`.`ptRefKey` 
                        LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
                        LEFT JOIN `promo_code` ON `promo_code`.`Promo` = %s 
                        LEFT JOIN `discount` ON `discount`.`promo_code_id` = `promo_code`.`ID` 
                            AND `discount`.`ptRefKey` = `product_type_relatives`.`PT_Ref_Key`
                        LEFT JOIN `stuff` ON `stuff`.`ID` = `promo_code`.`affiliateID`
                    WHERE find_in_set(`product_type_relatives`.`PT_Ref_Key`, %s)
                        AND `product_type_relatives`.`Language_ID` = %s 
                        AND `quantity`.`Quantity` > 0
                        AND `quantity`.`Status` = '1'
                        AND `quantity`.`expDate` >= CURDATE()
                    ORDER BY  `product_type`.`ID`,  `quantity`.`expDate`, `quantity`.`Quantity` DESC, `quantity`.`maxQuantity` DESC;
    """

    sqlValTuple = (data['promo'], ptIDs, languageID)
    result = sqlSelect(sqlQuaryStore, sqlValTuple, True)
    if result['length'] == 0:
        print('buffer_1')
        return {'status': "0", 'answer': smthWrong}  

    
    if data['promo'] != '' and result['data'][0]['promoID'] is None:
        return {'status': "2"}
    
    # This checks if there is corresponding amount of product in store
    for checkRow in data['ptData']:
        for checkR in result['data']:
            if checkRow['ptID'] == checkR['ptID']:
                QUANTITY = checkRow['quantity']
                # the stock's own limit, or MAX_ALLOWED_QUANTITY when it was saved without one,
                # and never more than is in stock
                purchaseLimit = checkR['maxQuantity'] if checkR['maxQuantity'] is not None else MAX_ALLOWED_QUANTITY
                maxAllowdQuantity = min(checkR['totalQuantity'], purchaseLimit)

                if maxAllowdQuantity < QUANTITY:  
                    print('buffer_2')

                    return {'status': "0", 'answer': smthWrong}  
                    # return {'status': "0", 'answer': smthWrong + 'maxAllowdQuantity is ' + str(maxAllowdQuantity) + ' and QUANTITY is ' + str(QUANTITY) + ' and ptID is ' + str(checkRow['ptID'])}  

    # 1) Plan the reservation: which stock rows give how many units, and the total price.
    #    Nothing is written yet, so any check below can still refuse the order without taking
    #    stock (before, the stock was subtracted first and a refusal lost those units for good)
    totalPrice = 0
    for row in data['ptData']:
        QUANTITY = len(data['contact_list'])
        for r in result['data']:
            if QUANTITY == 0:
                break
            
            if row['ptID'] == r['ptID']:
                take = min(r['Quantity'], QUANTITY)
                unitPrice = (priceOverrides or {}).get(r['ptID'], r['Price'])
                if r['discount'] is not None:
                    totalPrice = totalPrice + unitPrice * take - unitPrice * take * r['discount'] / 100
                else:
                    totalPrice = totalPrice + unitPrice * take

                bufferQuantities.append(
                    {
                        'quantityID': r['quantityID'],
                        'quantity': take, 
                        'promo_code_id': r['promoID'], 
                        'promo_code': r['Promo'], 
                        'discount': r['discount'], 
                        'affiliateID': r['affiliateID'],
                        'price': unitPrice, 
                        'ptID': r['ptID'],
                        'payment_details_id': pdID
                    })
                QUANTITY = QUANTITY - take

        # every requested unit must be covered, otherwise nothing is reserved (no half orders)
        if QUANTITY > 0:
            print('buffer_4')
            return {'status': "0", 'answer': smthWrong}

    if paymentMethod == False and totalPrice > 0: #checkout without paying
        print('buffer_3')
        return {'status': "0", 'answer': smthWrong}  

    if not bufferQuantities:
        return {'status': "0", 'answer': smthWrong}

    # 2) Reserve: take the units and write them to `buffer_store` in ONE transaction, committed
    #    once. Each stock row is decreased relative to its current value and only while it still
    #    has enough (two buyers at the same time can't oversell it); any failed step rolls back
    #    everything, so stock is never taken without being noted in `buffer_store`
    bufferInsertRows = "(%s, %s, %s, %s, %s, %s, %s, %s, %s)," * len(bufferQuantities)
    bufferValuePrototype = []
    for row in bufferQuantities:
        for key, val in row.items():
            bufferValuePrototype.append(val)
    
    sqlInsertBuffer = f"INSERT INTO `buffer_store` (`quantityID`, `quantity`,`promo_code_id`, `promo_code`,  `discount`, `affiliateID`, `price`, `ptRefKey`,  `payment_details_id`) VALUES {bufferInsertRows[:-1]};"
    sqlTakeQuantity = "UPDATE `quantity` SET `Quantity` = `Quantity` - %s WHERE `ID` = %s AND `Quantity` >= %s;"

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            for row in bufferQuantities:
                cursor.execute(sqlTakeQuantity, (row['quantity'], row['quantityID'], row['quantity']))
                if cursor.rowcount != 1:
                    # someone else bought these units in the meantime
                    raise RuntimeError(f"quantity {row['quantityID']} no longer has {row['quantity']} units")

            cursor.execute(sqlInsertBuffer, tuple(bufferValuePrototype))
            if cursor.rowcount != len(bufferQuantities):
                raise RuntimeError(f"buffer_store: {cursor.rowcount} of {len(bufferQuantities)} rows written")
        conn.commit()
    except Exception:
        conn.rollback()
        logging.exception("Reserving the stock failed and was rolled back (payment_details %s)", pdID)
        print('buffer_5')
        return {'status': "0", 'answer': smthWrong}

    return {'status': '1', 'answer': bufferQuantities, 'totalPrice': totalPrice}

# INSERT into purchase_histore
# UPDATE payment_details
def insertPUpdateP(pdID, paymentData):
    sqlQuery = """
                SELECT 
                `ptRefKey` AS `ptID`,
                SUM(`quantity`) AS `quantity`,
                `payment_details_id`,
                `promo_code_id`,
                `promo_code`,
                `discount`,
                `price`,
                `affiliateID`
            FROM `buffer_store` WHERE `payment_details_id` = %s 
            GROUP BY `ptRefKey`, `payment_details_id`, `promo_code_id`, `promo_code`, `discount`, `price`, `affiliateID`
            ;"""
    result = sqlSelect(sqlQuery, (pdID,), True)
    if result['length'] == 0:

        return {'status': '0', 'answer': result['error']}
    
    promoID, promo, affiliateID = [None, None, None]
    protoTuple = []
    answer = []
    for row in result['data']:
        if row['promo_code_id'] is not None:
            promoID = row['promo_code_id']
            promo = row['promo_code']

        if row['affiliateID'] is not None:    
            affiliateID = row['affiliateID']

        protoTuple.append(row['ptID'])
        protoTuple.append(row['quantity'])
        protoTuple.append(row['payment_details_id'])
        protoTuple.append(row['price'])
        protoTuple.append(row['discount'])
        protoTuple.append(2)

        answer.append({'ptID': int(row['ptID']), 'quantity': int(row['quantity'])})
    
    sqlValTuple = tuple(protoTuple)

    values = "(%s, %s, %s, %s, %s, %s)," * len(result['data'])
    sqlQueryInsert = f"""
                    INSERT INTO `purchase_history` 
                    (`ptRefKey`, `quantity`, `payment_details_id`, `price`, `discount`, `Status`)
                    VALUES {values[:-1]};
                    """

    # Recording the sale is all or nothing: the order is marked paid, its lines are written to
    # purchase_history and the affiliate's rewards to affiliate_history in ONE transaction on the
    # request's connection, committed once at the end. If any step fails everything is rolled
    # back, so a failure leaves no half-written order behind (the caller then decides what happens
    # to the reserved stock). sqlInsert/sqlUpdate commit on their own, so they can't be used here
    conn = get_db()
    try:
        with conn.cursor(dictionary=True) as cursor:
            # Paid only from "waiting for payment" (Status 1): a second call for the same order
            # (double submit, retry) changes nothing and is rolled back instead of recording it twice
            cursor.execute("""
                        UPDATE `payment_details` SET 
                            `promo_code_id` = %s,
                            `promo_code` = %s,
                            `affiliateID` = %s,
                            `final_price` = %s,
                            `payment_method` = %s,
                            `CMD` = %s,
                            `payment_status` = %s,
                            `timestamp` = NOW(),
                            `Status` = 2 
                        WHERE `ID` = %s AND `Status` = 1
                        ;""", (promoID, promo, affiliateID, paymentData['finalPrice'], paymentData['paymentMethod'], paymentData['CMD'], paymentData['paymentStatus'], pdID))
            if cursor.rowcount != 1:
                raise RuntimeError(f'payment_details {pdID} is not waiting for payment')

            cursor.execute(sqlQueryInsert, sqlValTuple)
            if cursor.rowcount != len(result['data']):
                raise RuntimeError(f'purchase_history: {cursor.rowcount} of {len(result["data"])} rows written for order {pdID}')

            if affiliateID is not None:
                # the lines just written (visible here: same connection and transaction)
                cursor.execute("""SELECT
                                    `purchase_history`.`ID`,	
                                    `discount`.`promo_code_id`,
                                    `promo_code`.`Promo` AS `promo_code`,
                                    `discount`.`revard_value`,
                                    `discount`.`revard_type`
                                FROM `purchase_history` 
                                    LEFT JOIN `payment_details` ON `payment_details`.`ID` = `purchase_history`.`payment_details_id`
                                    LEFT JOIN `discount` ON `discount`.`promo_code_id` = `payment_details`.`promo_code_id`
                                    LEFT JOIN `promo_code` ON `discount`.`promo_code_id` = `promo_code`.`ID`
                                WHERE `payment_details_id` = %s AND `purchase_history`.`discount` is not null;""", (pdID,))
                rowsAff = cursor.fetchall()

                # no discounted line, no reward (an INSERT with an empty VALUES list would fail)
                if rowsAff:
                    protoTupleAff = []
                    for row in rowsAff:
                        protoTupleAff += [row['ID'], affiliateID, row['promo_code_id'], row['promo_code'], row['revard_value'], row['revard_type']]
                    valuesAff = "(%s, %s, %s, %s, %s, %s)," * len(rowsAff)
                    cursor.execute(f"INSERT INTO `affiliate_history` (`purchase_history_id`, `affiliateID`, `promo_code_id`, `promo_code`, `revard_value`, `revard_type`) VALUES {valuesAff[:-1]};", tuple(protoTupleAff))
                    if cursor.rowcount != len(rowsAff):
                        raise RuntimeError(f'affiliate_history: {cursor.rowcount} of {len(rowsAff)} rows written for order {pdID}')

        conn.commit()
    except Exception:
        conn.rollback()
        logging.exception("Recording the sale failed and was rolled back (payment_details %s)", pdID)
        return {'status': '0', 'answer': gettext('Something went wrong. Please try again!')}

    return {'status': '1', 'answer': answer}


# release the order's buffer rows and return their quantities to table quantity
# update payment_details with id pdID
# Buffer rows are kept (Released = 1) so reservePUpdateP can take the stock again
#
# removeSaleRecords: only for a checkout that failed before the order was recorded. It also deletes
# any purchase_history / affiliate_history rows of the order, so a cancelled order can never keep
# sale lines or affiliate rewards. Staff cancelling a real order must NOT use it: those rows are the
# order's history (an affiliate's "Voided" rewards are counted from them, and un-cancelling needs them)
def deletePUpdateP(pdID, removeSaleRecords=False):
    if removeSaleRecords:
        conn = get_db()
        try:
            with conn.cursor() as cursor:
                cursor.execute("""DELETE `affiliate_history` FROM `affiliate_history`
                                    JOIN `purchase_history` ON `purchase_history`.`ID` = `affiliate_history`.`purchase_history_id`
                                  WHERE `purchase_history`.`payment_details_id` = %s;""", (pdID,))
                cursor.execute("DELETE FROM `purchase_history` WHERE `payment_details_id` = %s;", (pdID,))
            conn.commit()
        except Exception:
            conn.rollback()
            logging.exception("Removing the sale records of failed order %s failed", pdID)

    sqlQuery = """
            SELECT
                `ID`,
                `quantityID`,
                `quantity`
        FROM `buffer_store` WHERE `payment_details_id` = %s AND `Released` = 0
        ;"""
    result = sqlSelect(sqlQuery, (pdID,), True)
    if result['length'] == 0:
        return {'status': '0'}

    sqlRelease = "UPDATE `buffer_store` SET `Released` = 1 WHERE `ID` = %s AND `Released` = 0;"
    sqlUpdateQuantity = "UPDATE `quantity` SET `Quantity` = `Quantity` + %s WHERE `ID` = %s;"
    for row in result['data']:
        # the conditional update makes sure a row is only given back once
        if sqlUpdate(sqlRelease, (row['ID'],))['rows_affected'] == 1:
            sqlUpdate(sqlUpdateQuantity, (row['quantity'], row['quantityID']))

    sqlQueryPaymentD = """
                        UPDATE `payment_details` SET
                            `Status` = 0 -- 0 means canceled
                        WHERE `ID` = %s
                        ;"""
    sqlUpdate(sqlQueryPaymentD, (pdID,))
    return {'status': '1'}


# take the stock of a cancelled order again (undo of deletePUpdateP)
# all or nothing: if any quantity row has too little stock, everything is given back
def reservePUpdateP(pdID):
    sqlQuery = """
            SELECT
                `ID`,
                `quantityID`,
                `quantity`
        FROM `buffer_store` WHERE `payment_details_id` = %s AND `Released` = 1
        ;"""
    result = sqlSelect(sqlQuery, (pdID,), True)
    if result['error']:
        return {'status': '0'}

    sqlClaim = "UPDATE `buffer_store` SET `Released` = 0 WHERE `ID` = %s AND `Released` = 1;"
    sqlRelease = "UPDATE `buffer_store` SET `Released` = 1 WHERE `ID` = %s;"
    sqlTake = "UPDATE `quantity` SET `Quantity` = `Quantity` - %s WHERE `ID` = %s AND `Quantity` >= %s;"
    sqlGiveBack = "UPDATE `quantity` SET `Quantity` = `Quantity` + %s WHERE `ID` = %s;"

    reserved = []
    for row in result['data']:
        if sqlUpdate(sqlClaim, (row['ID'],))['rows_affected'] != 1:
            continue

        if sqlUpdate(sqlTake, (row['quantity'], row['quantityID'], row['quantity']))['rows_affected'] != 1:
            # not enough stock: undo this row and every row taken before it
            sqlUpdate(sqlRelease, (row['ID'],))
            for r in reserved:
                sqlUpdate(sqlGiveBack, (r['quantity'], r['quantityID']))
                sqlUpdate(sqlRelease, (r['ID'],))
            return {'status': '0'}

        reserved.append(row)

    return {'status': '1'}


def get_affiliate_reward_progress(affiliateID):
    languageID = getLangID()
    sqlQuery = f"""
                SELECT
                    `payment_details`.`affiliateID`,

                    -- SUM UP Voided Revards
                    (SELECT
                        SUM(CASE
                            WHEN `discount`.`revard_type` =  1
                                THEN `discount`.`revard_value` * `purchase_history`.`quantity`
                            ELSE  `purchase_history`.`quantity` * `purchase_history`.`price` * `discount`.`revard_value` / 100
                        END)
                    FROM `purchase_history`
                        LEFT JOIN `payment_details` ON `payment_details`.`ID` = `purchase_history`.`payment_details_id`
                        LEFT JOIN `promo_code` ON `payment_details`.`promo_code_id` = `promo_code`.`ID`
                        LEFT JOIN `product_type_relatives` ON `product_type_relatives`.`PT_Ref_Key` = `purchase_history`.`ptRefKey` 
                        LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
                        LEFT JOIN `discount` ON `discount`.`ptRefKey` = `product_type_relatives`.`PT_Ref_Key`
                            AND `discount`.`promo_code_id` = `payment_details`.`promo_code_id`
                    WHERE `payment_details`.`affiliateID` = %s
                        AND `product_type_relatives`.`Language_ID` = %s
                        AND `payment_details`.`Status` = 0
                        AND `purchase_history`.`discount` is not null
                    GROUP BY `payment_details`.`Status`) AS `Voided`,

                    -- SUM UP Pending Revards
                    (SELECT
                        SUM(CASE
                            WHEN `discount`.`revard_type` =  1
                                THEN `discount`.`revard_value` * `purchase_history`.`quantity`
                            ELSE  `purchase_history`.`quantity` * `purchase_history`.`price` * `discount`.`revard_value` / 100
                        END)
                    FROM `purchase_history`
                        LEFT JOIN `payment_details` ON `payment_details`.`ID` = `purchase_history`.`payment_details_id`
                        LEFT JOIN `promo_code` ON `payment_details`.`promo_code_id` = `promo_code`.`ID`
                        LEFT JOIN `product_type_relatives` ON `product_type_relatives`.`PT_Ref_Key` = `purchase_history`.`ptRefKey` 
                        LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
                        LEFT JOIN `discount` ON `discount`.`ptRefKey` = `product_type_relatives`.`PT_Ref_Key`
                            AND `discount`.`promo_code_id` = `payment_details`.`promo_code_id`
                    WHERE `payment_details`.`affiliateID` = %s
                        AND `product_type_relatives`.`Language_ID` = %s
                        AND `payment_details`.`Status` in (2,3,4)
                        AND `purchase_history`.`discount` is not null
                    GROUP BY `payment_details`.`affiliateID`) AS `Pending`,

                    -- SUM UP Approved Revards
                    (SELECT
                        SUM(CASE
                            WHEN `discount`.`revard_type` =  1
                                THEN `discount`.`revard_value` * `purchase_history`.`quantity`
                            ELSE  `purchase_history`.`quantity` * `purchase_history`.`price` * `discount`.`revard_value` / 100
                        END)
                    FROM `purchase_history`
                        LEFT JOIN `payment_details` ON `payment_details`.`ID` = `purchase_history`.`payment_details_id`
                        LEFT JOIN `promo_code` ON `payment_details`.`promo_code_id` = `promo_code`.`ID`
                        LEFT JOIN `product_type_relatives` ON `product_type_relatives`.`PT_Ref_Key` = `purchase_history`.`ptRefKey`
                        LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
                        LEFT JOIN `discount` ON `discount`.`ptRefKey` = `product_type_relatives`.`PT_Ref_Key`
                            AND `discount`.`promo_code_id` = `payment_details`.`promo_code_id`
                    WHERE `payment_details`.`affiliateID` = %s
                        AND `product_type_relatives`.`Language_ID` = %s
                        AND `payment_details`.`Status` = 5
                        AND `purchase_history`.`discount` is not null
                    GROUP BY `payment_details`.`Status`) AS `Approved`,

                    -- SUM UP Settled Revards
                    (SELECT SUM(`amount`) FROM `partner_payments` WHERE `affiliateID` = %s AND `type` = 1) AS `Settled`

                FROM `payment_details`
                    LEFT JOIN `clients` ON `payment_details`.`clientID` = `clients`.`ID`
                    LEFT JOIN `client_contacts` ON `payment_details`.`contactID` = `client_contacts`.`ID`
                    LEFT JOIN `purchase_history` ON `payment_details`.`ID` = `purchase_history`.`payment_details_id`
                WHERE `payment_details`.`affiliateID` = %s 
                GROUP BY `payment_details`.`affiliateID`;
                """
    sqlValTuple = (affiliateID, languageID, affiliateID, languageID, affiliateID, languageID, affiliateID, affiliateID) 
    result = sqlSelect(sqlQuery, sqlValTuple, True)

    return result


def get_affiliates(filters=''):


    sqlQuery =  f"""SELECT 
                            `stuff`.`ID`,
                            CONCAT(`stuff`.`Firstname`, ' ', `stuff`.`Lastname`) AS `Initials`, 
                            `position`.`Position`
                        FROM `stuff`
                            LEFT JOIN `position` ON `position`.`ID` = `stuff`.`PositionID`
                        WHERE `stuff`.`Status` = %s 
                            AND find_in_set(%s, `position`.`rolIDs`)
                            {filters}; 
                    """
    return sqlSelect(sqlQuery, (1,1), True) 


def check_alias(alias, languageID):
    sqlQuery = f""" SELECT `url` FROM `product`
                    WHERE `ID` = (SELECT `P_ID` FROM `product_relatives` WHERE `P_Ref_Key` = %s AND `Language_ID` = %s);"""

    sqlValTuple = (alias, languageID)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    
    if result['length'] > 0:
        return result['data'][0]['url']
    else:
        return False
    
def get_order_status_list():
    return {
        '0': gettext('Cancelled'),
        '1': gettext('Pending'),
        '2': gettext('Purchased'),
        '3': gettext('Preparing'),
        '4': gettext('Ready'),
        '5': gettext('Delivered')
    }



# Send email

MAILGUN_DOMAIN = os.getenv('MAILGUN_DOMAIN')  
MAILGUN_API_KEY = os.getenv('MAILGUN_API_KEY')

# recipient = 'misha818m@gmail.com'

def send_email_mailgun(credentials):
    response = requests.post(
        f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
        auth=("api", MAILGUN_API_KEY),
        data={
            "from": credentials['Sender'] + ' ' + credentials['From'],
            "to": [{credentials['To']}],
            "subject": credentials['Subject'],
            "text": "Testing Mailgun email sending with tracking.",
            "html": f"<html><body>{credentials['Content']}</body></html>",  
            "o:tracking": "yes"  # Enable tracking
        }
    )
    
    if response.status_code == 200:
        return {'status': '1', 'emailID': response.json().get('id')}  # Message ID for tracking
    else:
        return {'status': '0', 'answer': "Failed to send email:" + response.text} 

def check_delivery_status(message_id):
    time.sleep(10)  # Wait a bit to allow Mailgun to process
    response = requests.get(
        f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/events",
        auth=("api", MAILGUN_API_KEY),
        params={"message-id": message_id}  # Remove <> from ID
    )
    
    if response.status_code == 200:
        events = response.json().get('items', [])
        answer = False
        for event in events:
            if event.get('event') == 'delivered':
                answer = True
                
        return answer
    else:
        return answer


def check_rol_id(rollID):
    if not rollID.isdigit():
        return False
    
    sqlQuery =  """SELECT 
                        `stuff`.`ID`
                    FROM `stuff`
                        LEFT JOIN `position` ON `position`.`ID` = `stuff`.`PositionID`
                    WHERE `stuff`.`ID` = %s AND find_in_set(%s, `position`.`rolIDs`);
                """
    result = sqlSelect(sqlQuery, (session.get('user_id'), rollID), True)
    if result['length'] == 0:
        return False
    return True


# ── Silence cssutils warnings (they validate against CSS 2.1 by default) ──
cssutils.log.setLevel(logging.CRITICAL)

def inline_css(html_str: str, css_urls: list[str]) -> str:
    """
    Inlines class-based CSS from the given list of external stylesheets
    directly into each element’s `style` attribute, then removes `class="…"`
    from every element. Also adds `margin: 0; padding: 0;` to all <p> tags.

    Args:
        html_str (str): The input HTML as a unified string.
        css_urls (list[str]): Full URLs to CSS files (e.g. ["https://…/quill.snow.css"]).

    Returns:
        str: The modified HTML where every class-based rule has been inlined,
             all `class` attributes are stripped, and every <p> has zero margins/padding.
    """
    # Build a mapping of classname -> concatenated CSS rules (cssText).
    class_styles: dict[str, str] = {}

    for url in css_urls:
        resp = requests.get(url)
        resp.raise_for_status()
        sheet = cssutils.parseString(resp.text)

        for rule in sheet:
            if rule.type == rule.STYLE_RULE:
                style_text = rule.style.cssText.strip()
                if not style_text:
                    continue

                for sel in rule.selectorText.split(','):
                    found = re.findall(r'\.([A-Za-z0-9_-]+)', sel)
                    for cls_name in found:
                        if cls_name in class_styles:
                            class_styles[cls_name] += '; ' + style_text
                        else:
                            class_styles[cls_name] = style_text

    # Parse the HTML and inline all matching class styles onto each element.
    soup = BeautifulSoup(html_str, 'html.parser')

    for elem in soup.find_all(attrs={'class': True}):
        classes = elem.get('class', [])
        combined_rules: list[str] = []

        for cls in classes:
            if cls in class_styles:
                combined_rules.append(class_styles[cls])

        if combined_rules:
            existing = elem.get('style', '').rstrip(';')
            class_css = '; '.join(combined_rules).strip()
            if existing:
                new_style = existing + '; ' + class_css
            else:
                new_style = class_css
            elem['style'] = new_style.strip()

        del elem['class']

    # Ensure every <p> has margin: 0; padding: 0;
    for p in soup.find_all('p'):
        existing = p.get('style', '').rstrip(';')
        extra = 'margin: 0; padding: 0'
        if existing:
            p['style'] = existing + '; ' + extra
        else:
            p['style'] = extra

    # Ensure every <p> has margin: 0; padding: 0;
    for img in soup.find_all('img'):
        existing = img.get('style', '').rstrip(';')
        extra = 'width: 100%'
        if existing:
            img['style'] = existing + '; ' + extra
        else:
            img['style'] = extra

    return str(soup)


def send_confirmation_email(pdID, trackOrderUrl):
    """
    Sends a confirmation email to the user after successful order placement.
    """

    sqlQuery = f"""
    SELECT 
        `payment_details`.`ID`,
        `payment_details`.`payment_method`,
        `payment_details`.`CMD`,
        `payment_details`.`promo_code`,   
        `payment_details`.`final_price`,   
        `clients`.`FirstName`,
        `clients`.`LastName`,
        `phones`.`phone`,
        `emails`.`email`,
        `addresses`.`address`,    
        `notes`.`note`,
        `product`.`Url`,
        `product`.`Title` AS `prTitle`,
        `product_type`.`Title` AS `ptTitle`,
        `purchase_history`.`quantity`,
        `purchase_history`.`price`,
        `purchase_history`.`discount`
    FROM `payment_details` 
            LEFT JOIN `event_clients` ON `event_clients`.`payment_details_id` = `payment_details`.`ID` 
            LEFT JOIN `clients` ON `event_clients`.`clientID` = `clients`.`ID`
            LEFT JOIN `client_contacts` ON `event_clients`.`contactID` = `client_contacts`.`ID`
            LEFT JOIN `phones` ON `client_contacts`.`phoneID` = `phones`.`ID`
            LEFT JOIN `emails` ON `client_contacts`.`emailID` = `emails`.`ID`
            LEFT JOIN `addresses` ON `client_contacts`.`addressID` = `addresses`.`ID`
            LEFT JOIN `notes` ON `payment_details`.`notesID` = `notes`.`ID`
            LEFT JOIN `purchase_history` ON `payment_details`.`ID` = `purchase_history`.`payment_details_id`
            LEFT JOIN `product_type_relatives` ON `product_type_relatives`.`PT_Ref_Key` = `purchase_history`.`ptRefKey` 
            LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
            -- LEFT JOIN `product_type` ON ``.`ptID` = `product_type`.`ID`
            LEFT JOIN `product` ON `product`.`ID` = `product_type`.`product_ID`
    WHERE `payment_details`.`ID` = %s AND `product_type_relatives`.`Language_ID` = %s
    ORDER BY `product`.`Order`, `product_type`.`Order`;
"""
    result = sqlSelect(sqlQuery, (pdID, getLangID()), True)

    if result['length'] == 0:
        return False
    
    display = "display: none;"
    cp_price = ""
    if any(map(lambda row: row.get('discount'), result['data'])):
        display = ""
        cp_price = "text-decoration: line-through !important;"

    
    data = {
        "data": result['data'],
        "langPrefix": session.get('lang', 'en'),
        "type": "gmail",
        "template": "static.html",
        "subject": gettext("Payment Confirmation"),
        "mail_from": "info@araxitravel.am",
        "mail_from_user": gettext("company"),
        "mail_to": result['data'][0]['FirstName'] + ' ' + result['data'][0]['LastName'],
        "mail_to_email": result['data'][0]['email'],
        "main_url": get_full_website_name(),
        "logo_url": get_full_website_name() + '/static/images/logo.png',
        "logo_alt": gettext("company"),
        'btn_0_content': gettext('Click me'),
        'btn_0_href': trackOrderUrl,
        'greatings': gettext("Order Confirmed!"),
        'text_0': gettext("Dear") + ' ' + result['data'][0]['FirstName'] + ', ' + gettext('thank you for applying'),
        'text_1': gettext('Click the button below to view and download your ticket(s)'),
        'text_2': gettext("If you’re having trouble with the button above, copy and paste the URL below into your web browser."),
        'text_3': gettext("See you on the event"),
        'text_4': gettext("Kind regards"),
        'company_team': gettext("Araxi Travel Team"),

        # "text_0": gettext("Dear") + ' ' + result['data'][0]['FirstName'] + ', ' + gettext("Thank you for shopping with us. We are preparing your order now!"),
        # "delivery_info": gettext("Delivery Information"),
        # "Order": gettext("Order"),
        # "order_number": "#" + str(pdID),
        # "order_details": gettext("Order Details"),
        # "product": gettext("Product"),
        # "price": gettext("Price"),
        # "total": gettext("Total"),
        # "discount": gettext("Discount"),
        # "discounted_price": gettext("Discounted Price"),
        # "display": display,
        # "cp_price": cp_price,
        # "payment_method": gettext("Payment Method"),
        # "continue_shopping": gettext("Continue Shopping"),
        # "continue_shopping_url": get_full_website_name() + '/products-client',
        # "contact_us": gettext("Contact US"),
        # "contact_us_url": get_full_website_name() + '/contacts',
        # "track_order": gettext("Track Your Order"),
        # "track_order_url": trackOrderUrl,
        "title": gettext("Order Confirmed!"),
        "header": gettext("Order Confirmed!"),
        'company_name': gettext("company"),
        'company_rights': gettext("Your Company. All rights reserved."),
        "company_address": "",
        # "unsubscribe": gettext("unsubscribe"),
        # "unsubscribe_url": get_full_website_name() + '/unsubscribe',
        "year": datetime.now().year,
        'fb_icon': get_full_website_name() + '/static/images/icons/color-facebook-48.png',
        'insta_icon': get_full_website_name() + '/static/images/icons/color-instagram-48.png',
        'telegram_icon': get_full_website_name() + '/static/images/icons/color-telegram-48.png',
        'linkedin_icon': get_full_website_name() + '/static/images/icons/color-linkedin-48.png',
        'telegram_url': os.getenv('TG_URL'),
        'fb_url': os.getenv('FB_URL'),
        'insta_url': os.getenv('INS_URL'),
        'linkedin_url': os.getenv('IN_URL'),
        "main_currency": MAIN_CURRENCY
    }
    # resp = {'status_code': None}
    # resp = requests.post(os.getenv('SMAIL_API'), json=data)

    SMAIL_API = os.getenv('SMAIL_API')
    headers = {
        "X-API-KEY": os.getenv('SMAIL_API_KEY'),
        "Content-Type": "application/json"
    }
    # resp = requests.post(smailUrl, headers=headers, json=data)
    # resp = requests.post(SMAIL_API, headers=headers, json=data, timeout=(2,5), verify=True)

    resp = jsonify({'status_code': None})
    try:
        resp = requests.post(
            SMAIL_API,
            headers=headers,
            json=data,
            timeout=(2, 5),
            verify=True
        )
        resp.raise_for_status()  # raise if non-200 status
    except requests.exceptions.ConnectTimeout:
        print("Connection timed out while trying to connect to the server.")
    except requests.exceptions.ReadTimeout:
        print("Server did not send data in the allotted time.")
    except requests.exceptions.Timeout:
        print("Request timed out.")
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

    return True if resp.status_code == 200 else False


def is_valid_url(url: str) -> bool:
    try:
        result = urlparse(url)
        # A valid URL needs an http(s) scheme and netloc (rejects javascript: and data: links)
        return result.scheme in ('http', 'https') and bool(result.netloc)
    except ValueError:
        return False


def get_payment_methods(columns, constructDict=True):
    sqlQuery = f"SELECT {columns} FROM `payment_methods` WHERE `Status` = 1;"
    result = sqlSelect(sqlQuery, (), constructDict)
    
    return result

def get_pt_payment_methods(ptRefKey):
    languageID = getLangID()
    sqlQuery = """
            SELECT 
                `payment_methods`.`ID`, 
                `payment_methods`.`method` 
            FROM `payment_methods` 
                LEFT JOIN `product_type_relatives` ON `product_type_relatives`.`PT_Ref_Key` = %s
                LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
            WHERE `payment_methods`.`Status` = 1 AND `product_type_relatives`.`Language_ID` = %s
                AND find_in_set(`payment_methods`.`ID`, `product_type`.`payment_methods`);
            """
    result = sqlSelect(sqlQuery, (ptRefKey, languageID), True)
    return result


def jsonSanitaizer(data, invalidChars):
    if type(data[0]) is tuple:
        myList = list(deepcopy(data))
        index = 0
        for row in data:
            if row[1] is not None:
                for key, val in invalidChars.items():
                    if key in row[1]:
                        rowList = list(row) 
                        newRow = (rowList[0], rowList[1].replace(key, val))
                        myList[index] = newRow
            index += 1

        data = tuple(myList)

    if type(data[0]) is dict:
        for row in data:
            if row.get('Title') is not None:
                for key, val in invalidChars.items():
                    row['Title'] = row['Title'].replace(key, val)
            
            if row.get('prTitle') is not None:
                for key, val in invalidChars.items():
                    row['prTitle'] = row['prTitle'].replace(key, val)
            
            if row.get('ptTitle') is not None:
                for key, val in invalidChars.items():
                    row['ptTitle'] = row['ptTitle'].replace(key, val)
    return data


# Usage
# msg_id = send_email_mailgun()
# if msg_id:
#     check_delivery_status(msg_id)
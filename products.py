from flask import session, redirect, jsonify
from flask_babel import Babel, _, lazy_gettext as _l, gettext
from sysadmin import sanitize_html, get_full_website_name, checkForRedundantFiles, removeRedundantFiles, get_pr_id_by_lang, get_ar_id_by_lang, sqlInsert, sqlSelect, sqlUpdate, getLangID, getDefLang, getSupportedLangs, getUserID, get_pc_ref_key, get_pc_id_by_lang, pr_name_check, pr_url_check, fileUpload
from werkzeug.utils import secure_filename
import os
import re
import base64


# Determine the current script's directory
current_dir = os.path.dirname(os.path.abspath(__file__))

# Set the static folder path relative to the current script's directory
static_folder_path = os.path.join(current_dir, 'static')


# Quill embeds pasted images as <img src="data:image/<type>;filename=<name>;base64,<data>">
INLINE_IMAGE_PATTERN = r'<img\s+[^>]*src="data:image/([^;]+);filename=([^;]+);base64,([^"]+)"[^>]*>'
INLINE_IMAGE_TYPES = {'png', 'jpeg', 'jpg', 'gif', 'webp'}
IMG_SRC_PATTERN = r'<img[^>]+src="([^">]+)"'


def unique_file_name(target_directory, filename):
    # Appends/increments a _N suffix until the name is free: photo.png -> photo_1.png -> photo_2.png
    while os.path.exists(os.path.join(target_directory, filename)):
        name, ext = os.path.splitext(filename)
        arr = name.rsplit('_', 1)
        if len(arr) == 2 and arr[1].isdigit():
            filename = f"{arr[0]}_{int(arr[1]) + 1}{ext}"
        else:
            filename = f"{name}_1{ext}"
    return filename


def save_inline_images(html_content, imageDir, urlPrefix):
    """
    Saves Quill's base64 images into static/<imageDir> and replaces each data URI
    with urlPrefix + saved file name. Images with a disallowed type or broken data
    are left as data URIs, which sanitize_html() then strips.
    """
    target_directory = os.path.join(static_folder_path, imageDir)
    os.makedirs(target_directory, exist_ok=True)

    modified_html = html_content
    for image_type, filename, base64_string in re.findall(INLINE_IMAGE_PATTERN, html_content):
        if image_type.lower() not in INLINE_IMAGE_TYPES:
            continue

        try:
            image_data = base64.b64decode(base64_string, validate=True)
        except (ValueError, TypeError):
            continue

        # secure_filename() drops "../" and other path parts; non-Latin names come back empty.
        # The extension always comes from the allowed image type, never from the submitted name.
        name = secure_filename(os.path.splitext(filename)[0]) or 'image'
        ext = '.jpg' if image_type.lower() == 'jpeg' else '.' + image_type.lower()
        image_filename = unique_file_name(target_directory, name + ext)

        with open(os.path.join(target_directory, image_filename), 'wb') as image_file:
            image_file.write(image_data)

        image_url = urlPrefix + image_filename
        data_uri_pattern = re.escape(f'data:image/{image_type};filename={filename};base64,') + '([^"]+)'
        modified_html = re.sub(data_uri_pattern, lambda m: image_url, modified_html, count=1)

    return modified_html


def remove_unused_inline_images(old_html, new_html, imageDir):
    # Deletes files that the previous version of the text used and the new one no longer does.
    # Only URLs pointing into our own static/<imageDir> folder are considered.
    if not old_html:
        return

    ownPrefix = f'/static/{imageDir}/'
    old_img_urls = set(re.findall(IMG_SRC_PATTERN, old_html))
    new_img_urls = set(re.findall(IMG_SRC_PATTERN, new_html))

    for url in old_img_urls - new_img_urls:
        if url.startswith(ownPrefix):
            removeRedundantFiles(os.path.basename(url), imageDir)


def submit_product_text(html_content, productID):
    modified_html = save_inline_images(html_content, 'images/products', '/static/images/products/')
    modified_html = sanitize_html(modified_html)

    # Check for unused files and remove them
    sqlQueryOld = "SELECT `Text` FROM `product` WHERE `ID` = %s;"
    sqlQueryOldVal = (productID,)
    result = sqlSelect(sqlQueryOld, sqlQueryOldVal, True)

    if result['length'] > 0:
        remove_unused_inline_images(result['data'][0]['Text'], modified_html, 'images/products')
                
    # Insert the content into the MySQL database
    sqlUpdateRT =   f"""UPDATE `product` SET
                        `Text` = %s,
                        `DateModified` = CURDATE()
                        WHERE `ID` = %s     
                    """
    sqlUpdateRTValTuple = (modified_html, productID)
    resultRT = sqlUpdate(sqlUpdateRT, sqlUpdateRTValTuple)

    return resultRT


def submit_notes_text(html_content, type, refID, addresseeType):
    modified_html = save_inline_images(html_content, 'images/documents', '/static/images/documents/')
    modified_html = sanitize_html(modified_html)

    sqlInsertQuery =   "INSERT INTO `notes` (`note`, `type`, `refID`, `addressee_type`, `add_user_id`, `Status`) VALUES (%s, %s, %s, %s, %s, %s)"
    sqlInsertValTuple = (modified_html, type, refID, addresseeType, session['user_id'], 1)
    result = sqlInsert(sqlInsertQuery, sqlInsertValTuple)

    return result


def email_text(html_content, fieldType, refID, addresseeType):
    # Emails need absolute image URLs
    modified_html = save_inline_images(html_content, 'images/uploads', f'{get_full_website_name()}/static/images/uploads/')
    modified_html = sanitize_html(modified_html)

    sqlInsertQuery =   "INSERT INTO `notes` (`note`, `type`, `refID`, `addressee_type`, `add_user_id`, `Status`) VALUES (%s, %s, %s, %s, %s, %s)"
    sqlInsertValTuple = (modified_html, fieldType, refID, addresseeType, session['user_id'], 1)
    sqlInsert(sqlInsertQuery, sqlInsertValTuple)

    return modified_html
    

def submit_reach_text(html_content, productID):
    modified_html = save_inline_images(html_content, 'images/quilljs', '/static/images/quilljs/')
    modified_html = sanitize_html(modified_html)

    # Check for unused files and remove them
    sqlQueryOld = "SELECT `Text` FROM `article` WHERE `ID` = %s;"
    sqlQueryOldVal = (productID,)
    result = sqlSelect(sqlQueryOld, sqlQueryOldVal, True)

    if result['length'] > 0:
        remove_unused_inline_images(result['data'][0]['Text'], modified_html, 'images/quilljs')
                
    # Insert the content into the MySQL database
    sqlUpdateRT =   f"""UPDATE `article` SET
                        `Text` = %s,
                        `DateModified` = CURDATE()
                        WHERE `ID` = %s     
                    """
    sqlUpdateRTValTuple = (modified_html, productID)
    resultRT = sqlUpdate(sqlUpdateRT, sqlUpdateRTValTuple)

    return resultRT


# Add product category database action
def add_p_c_sql(categoryName, file, AltText, currentLanguage, spsID, xRatio, yRatio, newCSRFtoken):
    
    # Check whether Category Name exists
    sqlQuery = "SELECT `Product_Category_ID` FROM `product_category` WHERE `Product_Category_Name` = %s;"
    sqlValuesTuple = (categoryName,)
    result = sqlSelect(sqlQuery, sqlValuesTuple, True)
    
    if result['length'] > 0:
        answer = gettext('Category Exists!')
        return jsonify({'status': '3', 'answer': answer, 'newCSRFtoken': newCSRFtoken})
    
    # Save the file
    unique_filename = ''
    if file:
        unique_filename = fileUpload(file, 'images/pc_uploads')

    # Insert the content into the MySQL database
    sqlQuery = "INSERT INTO `product_category` (`Product_Category_Name`, `Product_Category_Images`, `AltText`, `User_ID`, `Product_Category_Status`, `spsID`, `xRatio`, `yRatio`) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
    userID = getUserID()
    sqlValuesTuple =  (categoryName, unique_filename, AltText, userID, 1, spsID, xRatio, yRatio)
    result = sqlInsert(sqlQuery, sqlValuesTuple)
    insertedID = result['inserted_id']
        
    # Get the highest AC_Ref_Key value
    sqlQueryLatestRel_ID = "SELECT `PC_Ref_Key` FROM `product_c_relatives` ORDER BY `PC_REF_KEY` DESC LIMIT 1"
    result = sqlSelect(sqlQueryLatestRel_ID, False, True)

    
    NewRef_KEY = 1
    if result['length'] > 0:
        NewRef_KEY = result['data'][0]['PC_Ref_Key'] + 1

    langID = currentLanguage

    # Insert into product_c_relatives
    sqlQueryRel = "INSERT INTO `product_c_relatives` (`PC_Ref_Key`, `PC_ID`, `Language_ID`, `User_ID`) VALUES (%s, %s, %s, %s)"
    sqlRelValuesTuple = (NewRef_KEY, insertedID, langID, userID)
    resultRel = sqlInsert(sqlQueryRel, sqlRelValuesTuple)
    
    answer = resultRel['answer']
    
    return jsonify({'status': '1', 'answer': answer, 'location': 'add-product-category'})


# Edit product category database action
def edit_p_c_sql(categoryName, file, AltText, pc_id, image, categoryStatus, relImage):
    
    # Check whether Category Name exists
    sqlQueryCheck = "SELECT `Article_Category_ID` FROM `article_category` WHERE `Article_Category_Name` = %s AND `Article_Category_ID` != %s ;"
    sqlValueTuple = (categoryName, pc_id)
    result = sqlSelect(sqlQueryCheck, sqlValueTuple, True)
   
    if result['length'] > 0:
        answer = gettext('Category Name Exists!')
        return jsonify({'status': '3', 'answer': answer}) # categoryName Exists 


    # Save the file
    unique_filename = fileUpload(file, 'images/pc_uploads')  

    # STegh es haskaci es inch if u else a!!!!!!!!!
    if image == '1':
        sqlScript = ''
        sqlValueTuple = (categoryName, categoryStatus, pc_id)    
    else:
        sqlScript = '`Article_Category_Images` = %s,'                
        sqlValueTuple = (categoryName, unique_filename, categoryStatus, pc_id)    


    # Update the content in the MySQL database
    sqlQuery = f"""
            UPDATE `article_category` 
            SET `Article_Category_Name` = %s, 
            {sqlScript}
                `Article_Category_Status` = %s 
            WHERE `Article_Category_ID` = %s
            """
   
    result = sqlUpdate(sqlQuery, sqlValueTuple)
    

    # new_id = '2'
    if result['status'] == '1':
        answer = gettext('Done!')
    else:
        answer = result['answer']

    return jsonify({'status': '1', 'answer': answer, 'location': 'article-categories'})


def edit_p_c_view(pc_ref_key):  
                                 
    # This checks if there is corresponding product category in any of available languages 
    # If no, returns {'content': False}
    sqlCheck = "SELECT `PC_ID` FROM `product_c_relatives` WHERE `PC_Ref_Key` = %s;"
    sqlCheckValTuple = (pc_ref_key,)
    rCheck = sqlSelect(sqlCheck, sqlCheckValTuple, True)

    if rCheck['length'] == 0: 
        
        content = {'content': False}
        return content
    
    langID = getLangID()
    
    # This checks if there is a registered product category in corresponding language
    # If there is, it will return dict with corresponding data
    # If no it will insert one
    sqlQuery =  f"""SELECT * FROM `product_category` 
                    WHERE `Product_Category_ID` = (SELECT `PC_ID` FROM `product_c_relatives` WHERE `PC_Ref_Key` = %s AND `Language_ID` = %s);
                """
    
    sqlValueTuple = (pc_ref_key, langID)
    result = sqlSelect(sqlQuery, sqlValueTuple, True)

    if result['length'] == 0:
        userID = getUserID()
        sqlInsertPC = "INSERT INTO `product_category` SET `User_ID` = %s, `Product_Category_Status` = %s;" 
        sqlValueTuplePC = (userID, 1)
        resultPC = sqlInsert(sqlInsertPC, sqlValueTuplePC)

        inserted_id =  resultPC['inserted_id']

        
        sqlInsertPC_Rel = f"""INSERT INTO `product_c_relatives` (`Language_ID`, `PC_ID`, `PC_Ref_Key`, `User_ID`) 
                            VALUES (%s, %s, %s, %s) 
                            """
        sqlInsertPC_RelVal = (langID, inserted_id, pc_ref_key, userID)

        resultPC_Rel = sqlInsert(sqlInsertPC_Rel, sqlInsertPC_RelVal)

        if resultPC_Rel['inserted_id']:

            sqlQuery1 =  f"""SELECT * FROM `product_category` 
                WHERE `Product_Category_ID` = (SELECT `PC_ID` FROM `product_c_relatives` WHERE `PC_Ref_Key` = %s AND `Language_ID` = %s);
            """

            sqlValueTuple1 = (pc_ref_key, langID)
            result1 = sqlSelect(sqlQuery1, sqlValueTuple1, True)



            if result1['length'] > 0:
                image1 = 0
                if result1['data'][0]['Product_Category_Images']:
                    image1 = result1['data'][0]['Product_Category_Images']

                myName = ''
                if result1['data'][0]['Product_Category_Name']:
                    myName = result1['data'][0]['Product_Category_Name']
                
                AltText = ''
                if result1['data'][0]['AltText']:
                    AltText = result1['data'][0]['AltText']

                content = {
                    'name': myName, 
                    'image': image1, 
                    'AltText': AltText, 
                    'xRatio': result1['data'][0]['xRatio'], 
                    'yRatio': result1['data'][0]['yRatio'], 
                    'status': result1['data'][0].get('Product_Category_Status'), 
                    'spsID': result1['data'][0].get('spsID'), 
                    'pc_id': result1['data'][0].get('Product_Category_ID'),
                    'content': True
                }
        else:
            content = {'content': False}
    else:
        myImage = 0
        if result['data'][0]['Product_Category_Images']:
            myImage = result['data'][0]['Product_Category_Images']
        
        myName = ''
        if result['data'][0]['Product_Category_Name']:
            myName = result['data'][0]['Product_Category_Name']
        
        AltText = ''
        if result['data'][0]['AltText']:
            AltText = result['data'][0]['AltText']


        content = {
            'name': myName, 
            'image': myImage, 
            'AltText': AltText, 
            'xRatio': result['data'][0]['xRatio'], 
            'yRatio': result['data'][0]['yRatio'], 
            'spsID': result['data'][0].get('spsID'), 
            'status': result['data'][0].get('Product_Category_Status'), 
            'pc_id': result['data'][0].get('Product_Category_ID'),
            'content': True
        }

    return content


def edit_a_c_view(pc_ref_key):  
                                 
    sqlCheck = "SELECT `AC_ID` FROM `article_c_relatives` WHERE `AC_Ref_Key` = %s;"
    sqlCheckValTuple = (pc_ref_key,)
    rCheck = sqlSelect(sqlCheck, sqlCheckValTuple, True)

    if rCheck['length'] == 0:
        content = {'content': False}
        return content

    langID = getLangID()
    
    sqlQuery =  f"""SELECT * FROM `article_category` 
                    WHERE `Article_Category_ID` = (SELECT `AC_ID` FROM `article_c_relatives` WHERE `AC_Ref_Key` = %s AND `Language_ID` = %s);
                """
    
    sqlValueTuple = (pc_ref_key, langID)
    result = sqlSelect(sqlQuery, sqlValueTuple, True)

    if result['length'] == 0:
        userID = getUserID()
        sqlInsertPC = "INSERT INTO `article_category` SET `User_ID` = %s, `Article_Category_Status` = %s;" 
        sqlValueTuplePC = (userID, 1)
        resultPC = sqlInsert(sqlInsertPC, sqlValueTuplePC)

        inserted_id =  resultPC['inserted_id']

        
        sqlInsertPC_Rel = f"""INSERT INTO `article_c_relatives` (`Language_ID`, `AC_ID`, `AC_Ref_Key`, `User_ID`) 
                            VALUES (%s, %s, %s, %s) 
                            """
        sqlInsertPC_RelVal = (langID, inserted_id, pc_ref_key, userID)

        resultPC_Rel = sqlInsert(sqlInsertPC_Rel, sqlInsertPC_RelVal)

        if resultPC_Rel['inserted_id']:

            sqlQuery1 =  f"""SELECT * FROM `article_category` 
                WHERE `Article_Category_ID` = (SELECT `AC_ID` FROM `article_c_relatives` WHERE `AC_Ref_Key` = %s AND `Language_ID` = %s);
            """

            sqlValueTuple1 = (pc_ref_key, langID)
            result1 = sqlSelect(sqlQuery1, sqlValueTuple1, True)



            if result1['length'] > 0:
                image1 = 0
                if result1['data'][0]['Article_Category_Images']:
                    image1 = result1['data'][0]['Article_Category_Images']

                myName = ''
                if result1['data'][0]['Article_Category_Name']:
                    myName = result1['data'][0]['Article_Category_Name']
                
                AltText = ''
                if result1['data'][0]['AltText']:
                    AltText = result1['data'][0]['AltText']

                content = {
                    'name': myName, 
                    'image': image1, 
                    'AltText': AltText, 
                    'status': result1['data'][0]['Article_Category_Status'], 
                    'pc_id': result1['data'][0]['Article_Category_ID'],
                    'content': True
                }
        else:
            content = {'content': False}
    else:
        myImage = 0
        if result['data'][0]['Article_Category_Images']:
            myImage = result['data'][0]['Article_Category_Images']
        
        myName = ''
        if result['data'][0]['Article_Category_Name']:
            myName = result['data'][0]['Article_Category_Name']
        
        AltText = ''
        if result['data'][0]['AltText']:
            AltText = result['data'][0]['AltText']


        content = {
            'name': myName, 
            'image': myImage, 
            'AltText': AltText, 
            'status': result['data'][0]['Article_Category_Status'], 
            'pc_id': result['data'][0]['Article_Category_ID'],
            'content': True
        }

    return content


def get_product_categories(pc_id, languageID):

    if pc_id is not None:
        # Get `Product_Category_ID` from `product` table
        sqlQuery = """
                    SELECT `Product_Category_ID` FROM `product` WHERE `ID` = %s
                   """
        sqlQueryValTuple = (pc_id,)
        result = sqlSelect(sqlQuery, sqlQueryValTuple, True)
        if result['length'] > 0:
            pc_id = result['data'][0]['Product_Category_ID']
        else:
            pc_id = None    

    # Select the content from `Product_Category` table
    sqlQueryCategory = f"""
                        SELECT `Product_Category_ID`, `Product_Category_Name`, `PC_Ref_Key`
                        FROM `product_category`
                        LEFT JOIN `product_c_relatives`
                            ON `product_c_relatives`.`PC_ID` = `product_category`.`Product_Category_ID`
                        WHERE `Product_Category_Status` = 1 
                            AND `product_c_relatives`.`Language_ID` = %s
                            AND `Product_Category_Name` != 'null'
                            ;
                        """
    sqlQueryCatVal = (languageID,)
    resultCategory = sqlSelect(sqlQueryCategory, sqlQueryCatVal, True)

    answer = {
        'product_category': resultCategory,
        'Product_Category_ID': pc_id
    }

    return answer


def get_pr_thumbnail_images(RefKey):
    langID = getLangID()
    sqlQuery = f"""SELECT `Thumbnail`, `AltText` 
                FROM `product` 
                LEFT JOIN `product_relatives` 
                    ON `product`.`ID` = `product_relatives`.`P_ID`
                WHERE `P_Ref_Key` = %s AND `product_relatives`.`Language_ID` != %s;
                """
    sqlValueTuple = (RefKey, langID)
    result = sqlSelect(sqlQuery, sqlValueTuple, True)

    answer = {'imageList': [], 'image': False}

    if result['length'] > 0:
        i = 0
        while i < len(result['data']):
            if result['data'][i]['Thumbnail'] is not None:
                if len(result['data'][i]['Thumbnail']) > 0:
                    answer['image'] = True
                    myDict = {'thumbnail': result['data'][i]['Thumbnail'], 'altText': result['data'][i]['AltText']}
                    answer['imageList'].append(myDict)
            i = i + 1

    return answer


def get_ar_thumbnail_images(RefKey):
    langID = getLangID()
    sqlQuery = f"""SELECT `Thumbnail`, `AltText` 
                FROM `article` 
                LEFT JOIN `article_relatives` 
                    ON `article`.`ID` = `article_relatives`.`A_ID`
                WHERE `A_Ref_Key` = %s AND `article_relatives`.`Language_ID` != %s;
                """
    sqlValueTuple = (RefKey, langID)
    result = sqlSelect(sqlQuery, sqlValueTuple, True)

    answer = {'imageList': [], 'image': False}

    if result['length'] > 0:
        i = 0
        while i < len(result['data']):
            if result['data'][i]['Thumbnail'] is not None:
                if len(result['data'][i]['Thumbnail']) > 0:
                    answer['image'] = True
                    myDict = {'thumbnail': result['data'][i]['Thumbnail'], 'altText': result['data'][i]['AltText']}
                    answer['imageList'].append(myDict)
            i = i + 1

    return answer


def get_product_category_images(RefKey):
    langID = getLangID()
    sqlQuery = f"""SELECT `Product_Category_Images`, `AltText` 
                FROM `product_category` 
                LEFT JOIN `product_c_relatives` 
                    ON `product_category`.`Product_Category_ID` = `product_c_relatives`.`PC_ID`
                WHERE `product_c_relatives`.`PC_Ref_Key` = %s AND `product_c_relatives`.`Language_ID` != %s;
                """
    sqlValueTuple = (RefKey, langID)

    result = sqlSelect(sqlQuery, sqlValueTuple, True)

    answer = {'imageList': [], 'image': False}

    if result['length'] > 0:
        i = 0
        while i < len(result['data']):
            if result['data'][i]['Product_Category_Images'] is not None:
                if len(result['data'][i]['Product_Category_Images']) > 0:
                    answer['image'] = True
                    myDict = {'Product_Category_Images': result['data'][i]['Product_Category_Images'], 'altText': result['data'][i]['AltText']}
                    answer['imageList'].append(myDict)
            i = i + 1

    return answer

def get_article_category_images(RefKey):
    langID = getLangID()
    sqlQuery = f"""SELECT `Article_Category_Images`, `AltText` 
                FROM `article_category` 
                LEFT JOIN `article_c_relatives` 
                    ON `article_category`.`Article_Category_ID` = `article_c_relatives`.`AC_ID`
                WHERE `article_c_relatives`.`AC_Ref_Key` = %s AND `article_c_relatives`.`Language_ID` != %s;
                """
    sqlValueTuple = (RefKey, langID)
    
    result = sqlSelect(sqlQuery, sqlValueTuple, True)

    answer = {'imageList': [], 'image': False}

    if result['length'] > 0:
        i = 0
        while i < len(result['data']):
            if result['data'][i]['Article_Category_Images'] is not None:
                if len(result['data'][i]['Article_Category_Images']) > 0:
                    answer['image'] = True
                    myDict = {'Article_Category_Images': result['data'][i]['Article_Category_Images'], 'altText': result['data'][i]['AltText']}
                    answer['imageList'].append(myDict)
            i = i + 1

    return answer

# Add product action
def add_product(productName, productLink, languageID, CategoryID, file, AltText, shortDescription, longDescription, RefKey): # 9

    myResponse = {'status': '1', 'answer': 'Done!'}

    # Check if product name (Product_Title) exists
    prNameCheck = pr_name_check(productName, languageID, None)    
    if prNameCheck['status'] == '1':    
        myResponse['status'] = '3'    
        myResponse['answer'] = prNameCheck['answer']    

        return myResponse

    
    # Check if link (Product_Url) exists
    prUrlCheck = pr_url_check(productLink, languageID, None)
    if prUrlCheck['status'] == '1':
        myResponse['status'] = '5'   
        myResponse['answer'] = prUrlCheck['answer']  
    
        return myResponse
 
    unique_filename = fileUpload(file, 'images/pr_thumbnails')
    Order = 1
    arrOrder = get_pr_order(languageID)
    if arrOrder['length'] > 0:
        Order = arrOrder['data'][arrOrder['length']-1]['Order'] + 1

    userID = getUserID()  
    sqlQueryInsert = "INSERT INTO `product` (`Title`, `Url`, `User_ID`, `Language_ID`, `Product_Category_ID`, `Thumbnail`, `AltText`,  `Product_Status`, `ShortDescription`, `LongDescription`, `Order`) Values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
    sqlQueryValInsert = (productName, productLink, userID, languageID, CategoryID, unique_filename, AltText, 1, shortDescription, longDescription, Order)

    resultInsert = sqlInsert(sqlQueryInsert, sqlQueryValInsert)

    if resultInsert['inserted_id']:
        inserted_id = resultInsert['inserted_id']
        
        myResponse['Ref_Key'] = RefKey
        if RefKey != '':

            sqlInsertRel = "INSERT INTO `product_relatives` (`P_ID`, `P_Ref_Key`, `Language_ID`, `User_ID`) VALUES (%s, %s, %s, %s)"
            sqlInsertRelVal = (inserted_id, RefKey, languageID, userID)
            resultRelAction = sqlInsert(sqlInsertRel, sqlInsertRelVal)

            if resultRelAction['inserted_id'] is None:
                myResponse['status'] = '0'     
                myResponse['answer'] = gettext('Something Wrong!')  
 

        else:
             
            PR_Ref_Key = 1

            sqlQueryRef_Key = "SELECT `P_Ref_Key` FROM `product_relatives` ORDER BY `P_REF_KEY` DESC LIMIT 1" 
            resultRefKey = sqlSelect(sqlQueryRef_Key, False, True)

            if resultRefKey['length'] > 0:
                PR_Ref_Key = resultRefKey['data'][0]['P_Ref_Key'] + 1

            sqlInsertRel = "INSERT INTO `product_relatives` (`P_ID`, `P_Ref_Key`, `Language_ID`, `User_ID`) VALUES (%s, %s, %s, %s)"
            sqlInsertRelVal = (inserted_id, PR_Ref_Key, languageID, userID)
            resultRelAction = sqlInsert(sqlInsertRel, sqlInsertRelVal)

            if resultRelAction['inserted_id'] is None:
                myResponse['status'] = '0'     
                myResponse['answer'] = gettext('Something Wrong!')  

            myResponse['Ref_Key'] = PR_Ref_Key
    else:
        myResponse['status'] = '0'     
        myResponse['answer'] = gettext('Something Wrong!')  

    return myResponse


def add_product_lang(productName, productLink, languageID, CategoryID, RefKey, file, AltText, shortDescription, longDescription): # 9

    myResponse = {'status': '1', 'answer': 'Done!'}
    
    # Check if product name (Product_Title) exists
    sqlQueryCheck3 = "SELECT `ID` FROM `article` WHERE `Title` = %s AND `Language_ID` = %s"
    sqlQueryCheck3Val = (productName, languageID)
    result3 = sqlSelect(sqlQueryCheck3, sqlQueryCheck3Val, True)

    if result3['length'] > 0:
        myResponse['status'] = '3'     
        myText = f"""'{productName}' Product Exists!"""
        myResponse['answer'] = gettext(myText)    

        return myResponse
    
    # Check if link (Product_Url) exists
    sqlQueryCheck5 = "SELECT `ID` FROM `article` WHERE `Url` = %s  AND `Language_ID` = %s"
    sqlQueryCheck5Val = (productLink, languageID)
    result5 = sqlSelect(sqlQueryCheck5, sqlQueryCheck5Val, True)

    if result5['length'] > 0:
        myResponse['status'] = '5'     
        myText = f"""'{productLink}' Link Exists!"""
        myResponse['answer'] = gettext(myText)    

        return myResponse
    
    unique_filename = fileUpload(file, 'images/thumbnails')
    
    userID = getUserID()
    # sqlQueryInsert = "INSERT INTO `article` (`Title`, `Url`, `User_ID`, `Language_ID`, `Article_Category_ID`, `Article_Status`, `Thumbnail`, `AltText`, `ShortDescription`, `LongDescription`) Values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
    # sqlQueryValInsert = (productName, productLink, userID, languageID, CategoryID, 1, unique_filename, altText, shortDescription, longDescription)
    sqlQueryInsert = "INSERT INTO `article` (`Title`, `Url`, `User_ID`, `Language_ID`, `Article_Category_ID`, `Thumbnail`, `AltText`,  `Article_Status`, `ShortDescription`, `LongDescription`) Values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
    sqlQueryValInsert = (productName, productLink, userID, languageID, CategoryID, unique_filename, AltText, 1, shortDescription, longDescription)

    print('Lang')
    print(sqlQueryValInsert)
    print('End of Lang')

    resultInsert = sqlInsert(sqlQueryInsert, sqlQueryValInsert)

    # print(resultInsert)
    if resultInsert['inserted_id']:
        inserted_id = resultInsert['inserted_id']

        sqlInsertRel = "INSERT INTO `article_relatives` (`A_ID`, `A_Ref_Key`, `Language_ID`, `User_ID`) VALUES (%s, %s, %s, %s)"
        sqlInsertRelVal = (inserted_id, RefKey, languageID, userID)
        resultRelAction = sqlInsert(sqlInsertRel, sqlInsertRelVal)

        if resultRelAction['inserted_id'] is None:
            myResponse['status'] = '0'     
            myResponse['answer'] = gettext('Something Wrong!')  

        myResponse['Ref_Key'] = RefKey
    else:
        myResponse['status'] = '0'     
        myResponse['answer'] = gettext('Something Wrong!')   # Problem is here

    return myResponse


def articleDetails(RefKey, articleStatus):
    sqlQuery = f""" SELECT 
                        `article`.`ID`,
                        `article`.`Article_Category_ID`,
                        `article`.`Url`,
                        `article`.`Title`,
                        `article`.`Text`,
                        `article`.`Thumbnail`,
                        `article`.`Language_ID`,
                        `article`.`ShortDescription`,
                        `article`.`LongDescription`,
                        `article`.`DateModified`,
                        `article`.`DatePublished`,
                        `article`.`Article_Status`
                    FROM `article`
                    LEFT JOIN `article_relatives` 
                        ON `article_relatives`.`A_ID` = `article`.`ID`
                    WHERE `article_relatives`.`A_Ref_Key` = %s 
                    AND `article`.`Language_ID` = %s
                    {articleStatus}
                    
                """
    Language_ID = getLangID()
    sqlValTuple = (RefKey, Language_ID)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    return result


def productDetails(RefKey, productStatus, Language_ID=''):
    sqlQuery = f""" SELECT 
                        `product`.`ID`,
                        `product`.`Order`,
                        `product`.`Product_Category_ID`,
                        `product`.`Url`,
                        `product`.`Title`,
                        `product`.`Text`,
                        `product`.`Thumbnail`,
                        `product`.`Language_ID`,
                        `product`.`ShortDescription`,
                        `product`.`LongDescription`,
                        `product`.`DateModified`,
                        `product`.`DatePublished`,
                        `product`.`Product_Status`
                    FROM `product`
                    LEFT JOIN `product_relatives` 
                        ON `product_relatives`.`P_ID` = `product`.`ID`
                    WHERE `product_relatives`.`P_Ref_Key` = %s 
                    AND `product`.`Language_ID` = %s
                    {productStatus}
                """
    
    if Language_ID == '':
        Language_ID = getLangID()

    sqlValTuple = (RefKey, Language_ID)
    result = sqlSelect(sqlQuery, sqlValTuple, True)

    return result


def constructPrData(RefKey, productStatus, languageID=''):
    prData = productDetails(RefKey, productStatus, languageID)
    content = {'content': False, 'headers': False}
    if prData['length'] > 0:
        row = prData['data'][0]
        content = {
            'Product_ID': row['ID'], 
            'Order': row['Order'], 
            'Product_Category_ID': row['Product_Category_ID'], 
            'Url': row['Url'], 
            'Title': row['Title'], 
            'Text': sanitize_html(row['Text']), 
            'Thumbnail': row['Thumbnail'], 
            'ShortDescription': row['ShortDescription'], 
            'LongDescription': row['LongDescription'], 
            'DateModified': row['DateModified'], 
            'DatePublished': row['DatePublished'], 
            'RefKey': RefKey, 
            'LanguageID': row['Language_ID'], 
            'prUpdate': gettext('Update'), 
            'prSaving': gettext('Saving...'), 
            'Status': row['Product_Status'], 
            'content': True
        }  

        if len(row['Title']) > 0 or len(row['Url']) > 0:
            content['headers'] = True   
    else:
        # Check whether product exists in any available language
        sqlQuery = "SELECT * FROM `product_relatives` WHERE `P_Ref_Key` = %s"
        sqlValTuple = (RefKey,)
        result = sqlSelect(sqlQuery, sqlValTuple, True)
        if result['length'] > 0:
            sqlQueryPC = "SELECT `Product_Category_ID` FROM `product` WHERE `ID` = %s"
            sqlQueryValPC = (result['data'][0]['P_ID'],)
            resultCategory = sqlSelect(sqlQueryPC, sqlQueryValPC, True)

            pcRefKey = get_pc_ref_key(resultCategory['data'][0]['Product_Category_ID']) 
            pc_id = get_pc_id_by_lang(pcRefKey)
            content['content'] = True
            content['Product_Category_ID'] = pc_id
            content['ID'] = result['data'][0]['P_ID']

    return content


def constructArData(RefKey, articleStatus):
    prData = productDetails(RefKey, articleStatus)
    content = {'content': False, 'headers': False}
    if prData['length'] > 0:
        row = prData['data'][0]
        content = {
            'Product_ID': row['ID'], 
            'Product_Category_ID': row['Article_Category_ID'], 
            'Url': row['Url'], 
            'Title': row['Title'], 
            'Text': sanitize_html(row['Text']), 
            'Thumbnail': row['Thumbnail'], 
            'ShortDescription': row['ShortDescription'], 
            'LongDescription': row['LongDescription'], 
            'DateModified': row['DateModified'], 
            'DatePublished': row['DatePublished'], 
            'RefKey': RefKey, 
            'LanguageID': row['Language_ID'], 
            'prUpdate': gettext('Update'), 
            'prSaving': gettext('Saving...'), 
            'Status': row['Article_Status'], 
            'content': True
        }  

        if len(row['Title']) > 0 or len(row['Url']) > 0:
            content['headers'] = True   
    else:
        # Check whether product exists in any available language
        sqlQuery = "SELECT * FROM `article_relatives` WHERE `A_Ref_Key` = %s"
        sqlValTuple = (RefKey,)
        result = sqlSelect(sqlQuery, sqlValTuple, True)
        if result['length'] > 0:
            sqlQueryPC = "SELECT `Article_Category_ID` FROM `article` WHERE `ID` = %s"
            sqlQueryValPC = (result['data'][0]['A_ID'],)
            resultCategory = sqlSelect(sqlQueryPC, sqlQueryValPC, True)

            pcRefKey = get_pc_ref_key(resultCategory['data'][0]['Article_Category_ID'])
            pc_id = get_pc_id_by_lang(pcRefKey)
            content['content'] = True
            content['Article_Category_ID'] = pc_id
            content['Product_Category_ID'] = pc_id
            content['ID'] = result['data'][0]['A_ID']


    return content

# product headers update action
def edit_p_h(productName, productLink, languageID, CategoryID, RefKey, ShortDescription, LongDescription):
    
    productID = get_pr_id_by_lang(RefKey, languageID)
    myResponse = {'status': '1', 'answer': 'Done!'}

    # return {'status': '1', 'answer': productID}

    # Check if product name exists
    nameCheck = pr_name_check(productName, languageID, productID)
    if nameCheck['status'] == '1':    
        myResponse['status'] = '3'    
        myResponse['answer'] = nameCheck['answer']    

        return myResponse

    # Check if product link exists
    urlCheck = pr_url_check(productLink, languageID, productID)
    if urlCheck['status'] == '1':
        myResponse['status'] = '5'   
        myResponse['answer'] = urlCheck['answer']  
    
        return myResponse
    
    userID = getUserID()
    sqlPRUpdate = f"""UPDATE `product`
                    SET `Title` = %s, 
                        `Url` = %s, 
                        `User_ID` = %s, 
                        `Language_ID` = %s, 
                        `ShortDescription` = %s, 
                        `LongDescription` = %s,
                        `DateModified` = CURDATE(), 
                        `Product_Category_ID` = %s
                    WHERE `ID` = %s
                    """
    sqlPRUpdateVal = (productName, productLink, userID, languageID, ShortDescription, LongDescription, CategoryID, productID)

    resulUpdate = sqlUpdate(sqlPRUpdate, sqlPRUpdateVal)

    return resulUpdate


# article headers update action
# def edit_a_h(productName, productLink, languageID, CategoryID, RefKey, ShortDescription, LongDescription):
    
#     productID = get_ar_id_by_lang(RefKey, languageID)
#     myResponse = {'status': '1', 'answer': 'Done!'}

#     # Check if product name exists
#     nameCheck = ar_name_check(productName, languageID, productID)
#     if nameCheck['status'] == '1':    
#         myResponse['status'] = '3'    
#         myResponse['answer'] = nameCheck['answer']    

#         return myResponse

#     # Check if product link exists
#     urlCheck = pr_url_check(productLink, languageID, productID)
#     if urlCheck['status'] == '1':
#         myResponse['status'] = '5'   
#         myResponse['answer'] = urlCheck['answer']  
    
#         return myResponse
    
#     userID = getUserID()
#     sqlPRUpdate = f"""UPDATE `article`
#                     SET `Title` = %s, 
#                         `Url` = %s, 
#                         `User_ID` = %s, 
#                         `Language_ID` = %s, 
#                         `ShortDescription` = %s, 
#                         `LongDescription` = %s,
#                         `DateModified` = CURDATE(), 
#                         `Article_Category_ID` = %s
#                     WHERE `ID` = %s
#                     """
#     sqlPRUpdateVal = (productName, productLink, userID, languageID, ShortDescription, LongDescription, CategoryID, productID)

#     resulUpdate = sqlUpdate(sqlPRUpdate, sqlPRUpdateVal)

#     return resulUpdate


def checkProductCategoryName(RefKey, languageID, categoryName):

    # Get product_category ID
    sqlQuery = f""" SELECT `PC_ID` FROM `product_c_relatives` 
                    WHERE `product_c_relatives`.`PC_Ref_Key` = %s
                      AND `product_c_relatives`.`Language_ID` = %s;                      
                """
    
    # WHERE Product_Category_ID != to our product category id
    sqlVal = (RefKey, languageID)
    result = sqlSelect(sqlQuery, sqlVal, True)

    categoryID = result['data'][0]['PC_ID']

    sqlQueryCheck = f"""
                    SELECT `Product_Category_ID` FROM `product_category` 
                    WHERE `Product_Category_ID` != %s
                        AND `Product_Category_Name` = %s      
                    """
    sqlValCheck = (categoryID, categoryName)
    resultCheck = sqlSelect(sqlQueryCheck, sqlValCheck, True)

    if resultCheck['length'] > 0:
        return True
    else:
        return False
    

def checkCategoryName(RefKey, languageID, categoryName):

    # Get article_category ID
    sqlQuery = f""" SELECT `AC_ID` FROM `article_c_relatives` 
                    WHERE `article_c_relatives`.`AC_Ref_Key` = %s
                      AND `article_c_relatives`.`Language_ID` = %s;                      
                """
    
    # WHERE Article_Category_ID != to our article category
    sqlVal = (RefKey, languageID)
    result = sqlSelect(sqlQuery, sqlVal, True)

    categoryID = result['data'][0]['AC_ID']

    sqlQueryCheck = f"""
                    SELECT `Article_Category_ID` FROM `article_category` 
                    WHERE `Article_Category_ID` != %s
                        AND `Article_Category_Name` = %s      
                    """
    sqlValCheck = (categoryID, categoryName)
    resultCheck = sqlSelect(sqlQueryCheck, sqlValCheck, True)

    if resultCheck['length'] > 0:
        return True
    else:
        return False
    

def get_RefKey_LangID_by_link(path):

    ptID, prUrl = ['', '']
    if '&' in path:
        arr = path.split('&')
        prUrl = arr[0]
        ptID = get_ptRefKey_by_title(arr[1]) # ptRefKey is used instead of ptID for multi-language purpose 
        
    else:
        prUrl = path
        
    sqlQuery = "SELECT `ID`, `Language_ID` FROM `product` WHERE `Url` = %s;"
    sqlValTuple = (prUrl,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    
    if result['length'] == 0:
        return None
    
    productID = result['data'][0]['ID']

    sqlQueryRef = "SELECT `P_Ref_Key` FROM `product_relatives` WHERE `P_ID` = %s;"
    sqlValRef = (productID,)
    resultRef = sqlSelect(sqlQueryRef, sqlValRef, True)

    content = {
        'RefKey': resultRef['data'][0]['P_Ref_Key'],
        'LanguageID': result['data'][0]['Language_ID'],
        'ptID': ptID,
        'Type': 'product'
    }

    return content


def get_ArticleID_LangID_by_link(path):
    sqlQuery = "SELECT `ID`, `Language_ID` FROM `article` WHERE `Url` = %s;"
    sqlValTuple = (path,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)

    if result['length'] == 0:
        return None
    
    content = {
        'ArticleID': result['data'][0]['ID'],
        'LanguageID': result['data'][0]['Language_ID'],
    }

    return content
    
def removeRedundantIMG(content):
    fileName = content['fileName']
    colonName = content['colonName']
    tableName = content['tableName']
    fileDir = content['fileDir']
    
    if checkForRedundantFiles(fileName, colonName, tableName) == True:
        removeRedundantFiles(fileName, fileDir)


def slidesToEdit(PrID):
    sqlQuery = f"""SELECT
                         `ID` AS `sliderID`,   
                         `Name` AS `imgName`,
                         `AltText`
                    FROM `slider`
                    WHERE `ProductID` = %s AND `Type` = 1
                    ORDER BY `ORDER` ASC
                """
    sqlValTuple = (PrID,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)

    return result['data']


def get_ptid_by_title(title):
    title = title.replace('-', ' ')
    sqlQuery = "SELECT `ID` FROM `product_type` WHERE `Title` = %s;"
    sqlValTuple = (title,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        return result['data'][0]['ID']
    else: 
        return ''


def get_ptRefKey_by_title(title): # By product_type.Title
    title = title.replace('-', ' ')
    sqlQuery = """
                    SELECT `product_type_relatives`.`PT_Ref_Key` 
                    FROM `product_type` 
                        LEFT JOIN `product_type_relatives` ON `product_type_relatives`.`PT_ID` = `product_type`.`ID` 
                    WHERE `product_type`.`Title` = %s;"""
    
    sqlValTuple = (title,)
    result = sqlSelect(sqlQuery, sqlValTuple, True)
    if result['length'] > 0:
        return result['data'][0]['PT_Ref_Key']
    else: 
        return ''


def get_pr_order(languageID=None):
    if languageID is None:
        languageID = getLangID()
    sqlQuery = "SELECT `Order` FROM `product` WHERE `Language_ID` = %s ORDER BY `Order`;"
    
    result = sqlSelect(sqlQuery, (languageID,), True)
    
    return result 
# The client's cart: bookings chosen on the service page (slideshow.html "Add to cart") and kept for
# later. Each item is one booking of one price: who comes (a count per age group), the vehicle and the
# guide, exactly what "Book Now" sends to the buy-now page. Nothing is priced from the cookie: every
# time the cart is shown, booking.py checks the choices again and works out the price, so the cart and
# the buy-now page always agree. An item is bought on the buy-now page (its "Book Now" link), which
# removes it from the cart once the order is placed.
#
# Kept in the cookie CART_COOKIE (not in the session: logging in and out clears the session), set by
# the server only. Value: base64 of JSON [{id, pt, v, g, a}], where
#   id  a short random key of the item
#   pt  the price (PT_Ref_Key, the same in every language)
#   v   the vehicle's Ref_Key (vehicle_relatives; vehicle IDs differ between languages) or null
#   g   the guide language (languages.Language_ID, 0 = no guide)
#   a   {age.ID: count}
#   d   the day booked for ('YYYY-MM-DD'); null for items added before there was a date (chosen on buy-now)
#   l   the language it was added in (languages.Language_ID): prices are set per language, so a price may
#       not be offered in the language the cart is shown in
import base64
import json
import secrets

from flask_babel import gettext
from datetime import date
from booking import booking_options, booking_quote, parse_booking_date, to_int, NO_GUIDE, PRICING_VEHICLE
from sysadmin import sqlSelect

CART_COOKIE = 'araxi_cart'
CART_MAX_AGE = 30 * 24 * 3600   # 30 days
MAX_CART_ITEMS = 20


def read_cart(request):
    """The items of the cart cookie (unreadable parts are dropped)"""
    raw = request.cookies.get(CART_COOKIE, '')
    if not raw:
        return []
    try:
        items = json.loads(base64.urlsafe_b64decode(raw.encode()).decode())
    except (ValueError, UnicodeDecodeError):
        return []
    if not isinstance(items, list):
        return []
    cart = []
    for item in items[:MAX_CART_ITEMS]:
        if not isinstance(item, dict) or not isinstance(item.get('a'), dict):
            continue
        pt, guide = to_int(item.get('pt')), to_int(item.get('g'), NO_GUIDE)
        ages = {to_int(k): to_int(n) for k, n in item['a'].items()}
        if pt is None or not ages or any(k is None or n is None or n < 1 for k, n in ages.items()):
            continue
        cart.append({'id': str(item.get('id', ''))[:16] or secrets.token_hex(4), 'pt': pt,
                     'v': to_int(item.get('v')), 'g': guide, 'a': ages, 'd': iso_date(item.get('d')), 'l': to_int(item.get('l'))})
    return cart


def write_cart(response, cart):
    """Saves the cart in its cookie on response (an empty cart removes the cookie)"""
    if not cart:
        response.delete_cookie(CART_COOKIE, path='/')
        return response
    value = base64.urlsafe_b64encode(json.dumps(cart, separators=(',', ':')).encode()).decode()
    response.set_cookie(CART_COOKIE, value, max_age=CART_MAX_AGE, path='/', httponly=True, samesite='Lax')
    return response


def iso_date(text):
    """text if it is a 'YYYY-MM-DD' date, else None"""
    try:
        return date.fromisoformat(str(text)).isoformat() if text else None
    except ValueError:
        return None


def cart_count(request):
    """How many bookings the cart holds (the header's badge)"""
    return len(read_cart(request))


def vehicle_ref_key(vehicleID):
    result = sqlSelect("SELECT `Ref_Key` FROM `vehicle_relatives` WHERE `Vehicle_ID` = %s LIMIT 1;", (vehicleID,), True)
    return result['data'][0]['Ref_Key'] if result['length'] else None


def vehicle_in_language(refKey, languageID):
    """The vehicle ID of the vehicle refKey in languageID, or None"""
    if refKey is None:
        return None
    result = sqlSelect("SELECT `Vehicle_ID` FROM `vehicle_relatives` WHERE `Ref_Key` = %s AND `Language_ID` = %s LIMIT 1;",
                       (refKey, languageID), True)
    return result['data'][0]['Vehicle_ID'] if result['length'] else None


def parse_age_counts(text):
    """'<age ID>:<count>,...' (as the buy-now link has it) -> {age ID: count}"""
    counts = {}
    for part in (text or '').split(','):
        ageID, count = part.partition(':')[::2]
        ageID, count = to_int(ageID), to_int(count)
        if ageID is not None and count is not None and count > 0:
            counts[ageID] = counts.get(ageID, 0) + count
    return counts


def expand_ages(counts):
    return [ageID for ageID, n in counts.items() for _ in range(n)]


def new_cart_item(ptRefKey, vehicleID, guideID, ageCounts, bookingDate, languageID):
    """A cart item from the service page's choices, checked like a booking (bookingDate: 'YYYY-MM-DD').
    Returns (item, None) or (None, error message)"""
    options = booking_options(ptRefKey, languageID)
    if options is None:
        return None, gettext('Something went wrong. Please try again!')
    day, error = parse_booking_date(bookingDate, options['ptRefKey'])
    if error:
        return None, error
    people = sum(ageCounts.values())
    if people < 1:
        return None, gettext('Please choose who is coming.')
    quote = booking_quote(options, people, vehicleID, guideID, expand_ages(ageCounts))
    if not quote['ok']:
        return None, quote['error']
    vehicleKey = vehicle_ref_key(quote['vehicle']['ID']) if quote['vehicle'] else None
    item = {'id': secrets.token_hex(4), 'pt': options['ptRefKey'], 'v': vehicleKey,
            'g': quote['guide']['ID'] if quote['guide'] else NO_GUIDE, 'a': quote['ageCounts'], 'd': day.isoformat(),
            'l': int(languageID)}
    return item, None


def same_booking(a, b):
    return a['pt'] == b['pt'] and a['v'] == b['v'] and a['g'] == b['g'] and a['a'] == b['a'] and a['d'] == b['d']


def cart_items_on(cart, bookingDate, languageID, exceptID=''):
    """The titles ('Service: Price') of the cart's bookings for the day bookingDate ('YYYY-MM-DD'), except
    the item exceptID (the one being booked from the cart)"""
    day = iso_date(bookingDate)
    items = [item for item in cart if day and item['d'] == day and item['id'] != exceptID]
    products = product_rows({item['pt'] for item in items}, languageID)
    titles = []
    for item in items:
        product = products.get(item['pt']) or product_rows({item['pt']}, item['l'] or languageID).get(item['pt'])
        if product:
            titles.append(product['prTitle'] + ': ' + product['ptTitle'])
    return titles


def product_rows(ptRefKeys, languageID):
    """{ptRefKey: {prTitle, prUrl, ptTitle, imgName, AltText}} of the prices in languageID"""
    if not ptRefKeys:
        return {}
    rows = sqlSelect("""SELECT `product_type_relatives`.`PT_Ref_Key` AS `ptRefKey`,
                               `product`.`Title` AS `prTitle`, `product`.`Url` AS `prUrl`,
                               `product_type`.`Title` AS `ptTitle`,
                               (SELECT `Name` FROM `slider` WHERE `slider`.`ProductID` = `product_type`.`ID` AND `slider`.`Type` = 2 ORDER BY `slider`.`Order` LIMIT 1) AS `imgName`,
                               (SELECT `AltText` FROM `slider` WHERE `slider`.`ProductID` = `product_type`.`ID` AND `slider`.`Type` = 2 ORDER BY `slider`.`Order` LIMIT 1) AS `AltText`
                        FROM `product_type_relatives`
                            LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
                            LEFT JOIN `product` ON `product`.`ID` = `product_type`.`Product_ID`
                        WHERE `product_type_relatives`.`Language_ID` = %s
                            AND FIND_IN_SET(`product_type_relatives`.`PT_Ref_Key`, %s);""",
                     (languageID, ','.join(str(k) for k in ptRefKeys)), True)['data']
    return {row['ptRefKey']: row for row in rows}


def language_prefix(languageID):
    result = sqlSelect("SELECT `Prefix` FROM `languages` WHERE `Language_ID` = %s;", (languageID,), True)
    return result['data'][0]['Prefix'] if result['length'] else None


def buy_now_query(item, vehicleID, quote, dateOk):
    """The buy-now link's choices, as the service page's "Book Now" sends them (static/JS/booking.js)"""
    query = {'guide': quote['guide']['ID'] if quote['guide'] else NO_GUIDE,
             'ages': ','.join(f'{k}:{n}' for k, n in item['a'].items()), 'cart': item['id']}
    if vehicleID:
        query['vehicle'] = vehicleID
    if dateOk:
        query['date'] = item['d']
    return query


def cart_view(cart, languageID):
    """The cart as the cart page shows it: one entry per item, priced now
    [{id, available, prTitle, prUrl, ptTitle, imgName, AltText, people, ages: [{Name, count}], vehicle, guide,
      lines, total, buyNow: {surl, query}, otherLanguage, date, dateOk, sameDay}]
    available is False when the price or a choice is no longer offered (only removing it is possible).
    date: the day booked for (a date, or None); dateOk: it can still be booked for that day (if not, the
    day is chosen again on the buy-now page); sameDay: another booking in the cart is for the same day.
    otherLanguage: the prefix of the language the item was added in, when the price isn't offered in
    languageID but still is in that one (the page offers to switch)"""
    products = product_rows({item['pt'] for item in cart}, languageID)
    days = [item['d'] for item in cart if item['d']]
    view = []
    for item in cart:
        entry = {'id': item['id'], 'available': False, 'people': sum(item['a'].values()), 'ages': [],
                 'vehicle': None, 'guide': None, 'lines': [], 'total': 0, 'buyNow': None, 'otherLanguage': None,
                 'date': date.fromisoformat(item['d']) if item['d'] else None, 'dateOk': False,
                 'sameDay': bool(item['d']) and days.count(item['d']) > 1}
        product = products.get(item['pt'])
        options = booking_options(item['pt'], languageID)
        if options is None and item['l'] and item['l'] != int(languageID) and booking_options(item['pt'], item['l']) is not None:
            entry['otherLanguage'] = language_prefix(item['l'])
            product = product_rows({item['pt']}, item['l']).get(item['pt'])
        entry.update(product or {'prTitle': '', 'prUrl': '', 'ptTitle': '', 'imgName': None, 'AltText': ''})
        if options is not None:
            vehicleID = vehicle_in_language(item['v'], languageID) if options['basis'] == PRICING_VEHICLE else None
            quote = booking_quote(options, entry['people'], vehicleID, item['g'], expand_ages(item['a']))
            if quote['ok']:
                names = {a['ID']: a['Name'] for a in options['ages']}
                entry['dateOk'] = bool(item['d']) and parse_booking_date(item['d'], options['ptRefKey'])[0] is not None
                entry.update({
                    'available': True,
                    'ages': [{'Name': names[a['ID']], 'count': item['a'][a['ID']]} for a in options['ages'] if item['a'].get(a['ID'])],
                    'vehicle': quote['vehicle'],
                    'guide': quote['guide'],
                    'lines': quote['lines'],
                    'total': quote['total'],
                    'buyNow': {'surl': f"{options['ptRefKey']}-{entry['people']}", 'query': buy_now_query(item, vehicleID, quote, entry['dateOk'])},
                })
        view.append(entry)
    return view

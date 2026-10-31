# Booking a price (product type) on the public pages: the options a client can choose and what the
# booking costs. The service page (slideshow.html), the buy-now page, the promo code check and
# /checkout all use booking_quote(), so the amount charged is always worked out on the server.
#
# How a price is priced (product_type.PricingBasis, set on Add / Edit Price):
#   0 fixed     -> Price x people (everyone pays the same)
#   1 vehicle   -> the chosen vehicle's price (per vehicle, v_price); the group can't be bigger than
#                  its seats
#   2 age group -> the sum of each person's age group price (per person, age_price)
# Every booking says how many people of each age group come. Who can join: with fixed / vehicle pricing
# the price's pt_age groups (every group when it has none), with age group pricing the priced groups.
# Everyone counts (group size, seats, stock), infants too. product_type.AdultRequired: an Adult or a
# Senior must come.
# A guide (guide_price, per group) is added to any of them; "No guide" (0) is free, and not offered
# when product_type.GuideRequired is 1.
# One person = one ticket = one unit of stock, as before.
# Every booking is for one day (booking_date_range): from MIN_DAYS_AHEAD days after today up to the last
# day the price's stock is valid (quantity.expDate). There is no schedule or per-day capacity yet.
from datetime import date, datetime, timedelta
from flask_babel import gettext, ngettext, format_date, format_datetime
from sysadmin import sqlSelect, sqlInsert, MAX_ALLOWED_QUANTITY

PRICING_FIXED, PRICING_VEHICLE, PRICING_AGE = 0, 1, 2
NO_GUIDE = 0
MAX_NOTES_LENGTH = 2000
ADULT_AGE_GROUPS = ('Adult', 'Senior')   # age.ageGroups that count as adults
MIN_DAYS_AHEAD = 1                        # the earliest booking day: tomorrow (no same-day bookings)


def age_group_name(name):
    names = {'Infant': gettext('Infant'), 'Child': gettext('Child'), 'Teen': gettext('Teen'), 'Adult': gettext('Adult'), 'Senior': gettext('Senior')}
    return names.get(name, name)


def age_group(row, price=None):
    """An age group as the booking uses it: {ID, Name, Range, Adult, Price}"""
    return {'ID': row['ID'], 'Name': age_group_name(row['ageGroups']), 'Range': (row['ageRange'] or '').replace('-', '–'),
            'Adult': row['ageGroups'] in ADULT_AGE_GROUPS, 'Price': price}


def allowed_age_groups(ptID):
    """Who can join a price set fixed or by vehicle: its pt_age groups, every group when it has none"""
    rows = sqlSelect("""SELECT `age`.`ID`, `age`.`ageGroups`, `age`.`ageRange`
                         FROM `pt_age`
                             JOIN `age` ON `age`.`ID` = `pt_age`.`ageID`
                         WHERE `pt_age`.`productTypeID` = %s
                         ORDER BY `age`.`Order`, `age`.`ID`;""", (ptID,), True)['data']
    if not rows:
        rows = sqlSelect("SELECT `ID`, `ageGroups`, `ageRange` FROM `age` ORDER BY `Order`, `ID`;", (), True)['data']
    return [age_group(row) for row in rows]


def booking_date_range(ptRefKey):
    """The days the price ptRefKey can be booked for: (first, last) dates, or None when there is none.
    first: MIN_DAYS_AHEAD days after today; last: the last day of its valid stock (quantity.expDate)"""
    first = date.today() + timedelta(days=MIN_DAYS_AHEAD)
    result = sqlSelect("""SELECT MAX(`expDate`) AS `last` FROM `quantity`
                          WHERE `ptRefKey` = %s AND `Status` = 1 AND `Quantity` > 0 AND `expDate` >= %s;""",
                       (ptRefKey, first), True)
    last = result['data'][0]['last'] if result['length'] else None
    return (first, last) if last else None


def booking_stock_limit(ptRefKey):
    """How many people one booking of the price ptRefKey can be for at most: its valid stock, never more
    than its stock's own limit (quantity.maxQuantity, MAX_ALLOWED_QUANTITY when none). The service page's
    people dropdown has the same limit (/get-pt-quantity). None when it has no stock"""
    result = sqlSelect("""SELECT SUM(`Quantity`) AS `quantity`, MAX(`maxQuantity`) AS `maxQuantity` FROM `quantity`
                          WHERE `ptRefKey` = %s AND `Status` = 1 AND `expDate` > CURDATE();""", (ptRefKey,), True)
    row = result['data'][0] if result['length'] else None
    if row is None or not row['quantity'] or row['quantity'] < 1:
        return None
    limit = row['maxQuantity'] if row['maxQuantity'] is not None else MAX_ALLOWED_QUANTITY
    return int(min(row['quantity'], limit))


def parse_booking_date(text, ptRefKey):
    """The booking day text ('YYYY-MM-DD') if the price can be booked for it: (date, None), else
    (None, error message)"""
    try:
        day = date.fromisoformat(str(text or '').strip())
    except ValueError:
        return None, gettext('Please choose a date.')
    dates = booking_date_range(ptRefKey)
    if dates is None or not dates[0] <= day <= dates[1]:
        return None, gettext('This date is not available. Please choose another date.')
    return day, None


def booking_options(ptRefKey, languageID):
    """What can be chosen for the price ptRefKey (PT_Ref_Key) in languageID, or None if it doesn't
    exist or is disabled:
    {'ptRefKey', 'ptID', 'title', 'basis', 'price', 'notesEnabled', 'notesRequired', 'guideRequired', 'adultRequired',
     'duration' (minutes or None),
     'vehicles': [{ID, Type, Seats, Price}],           offered vehicles (vehicle pricing)
     'ages': [{ID, Name, Range, Adult, Price}],        who can join: the priced groups with their prices
                                                       (age pricing), else the allowed groups without
                                                       a price
     'guides': [{ID, Language, Prefix, Price}]}        offered guide languages ("No guide" is not listed)"""
    result = sqlSelect("""SELECT `product_type`.`ID`, `product_type`.`Title`, `product_type`.`Price`,
                                 IFNULL(`product_type`.`PricingBasis`, 0) AS `PricingBasis`,
                                 `product_type`.`NotesEnabled`, `product_type`.`NotesRequired`, `product_type`.`GuideRequired`,
                                 `product_type`.`AdultRequired`, `product_type`.`Duration`
                          FROM `product_type_relatives`
                              LEFT JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
                          WHERE `product_type_relatives`.`PT_Ref_Key` = %s
                              AND `product_type_relatives`.`Language_ID` = %s
                              AND `product_type`.`Status` = 1
                          LIMIT 1;""", (ptRefKey, languageID), True)
    if result['length'] == 0:
        return None
    row = result['data'][0]
    ptID = row['ID']
    options = {
        'ptRefKey': int(ptRefKey),
        'ptID': ptID,
        'title': row['Title'],
        'basis': row['PricingBasis'],
        'price': float(row['Price'] or 0),
        'notesEnabled': row['NotesEnabled'] if row['NotesEnabled'] is not None else 1,
        'notesRequired': row['NotesRequired'] or 0,
        'guideRequired': row['GuideRequired'] or 0,
        'adultRequired': row['AdultRequired'] or 0,
        'duration': row['Duration'],
        'vehicles': [],
        'ages': [],
        'guides': [],
    }

    if options['basis'] == PRICING_VEHICLE:
        options['vehicles'] = sqlSelect("""SELECT `vehicle`.`ID`, `vehicle`.`Type`, `vehicle`.`Seats`, `v_price`.`Price`
                                           FROM `v_price`
                                               JOIN `vehicle` ON `vehicle`.`ID` = `v_price`.`vehicleID` AND `vehicle`.`Status` = 1
                                           WHERE `v_price`.`productTypeID` = %s
                                           ORDER BY `vehicle`.`Order`, `vehicle`.`ID`;""", (ptID,), True)['data']
    if options['basis'] == PRICING_AGE:
        rows = sqlSelect("""SELECT `age`.`ID`, `age`.`ageGroups`, `age`.`ageRange`, `age_price`.`Price`
                            FROM `age_price`
                                JOIN `age` ON `age`.`ID` = `age_price`.`ageID`
                            WHERE `age_price`.`productTypeID` = %s
                            ORDER BY `age`.`Order`, `age`.`ID`;""", (ptID,), True)['data']
        options['ages'] = [age_group(r, r['Price']) for r in rows]
    else:
        options['ages'] = allowed_age_groups(ptID)

    options['guides'] = sqlSelect("""SELECT `languages`.`Language_ID` AS `ID`, `languages`.`Language`, `languages`.`Prefix`, `guide_price`.`Price`
                                     FROM `guide_price`
                                         JOIN `languages` ON `languages`.`Language_ID` = `guide_price`.`languageID`
                                     WHERE `guide_price`.`productTypeID` = %s
                                     ORDER BY `languages`.`Language_ID`;""", (ptID,), True)['data']
    return options


def default_guide(options, langPrefix):
    """The guide chosen at first: the one speaking the page's language if it is offered, else no guide
    (the first offered guide language when a guide is required)"""
    for guide in options['guides']:
        if guide['Prefix'] == langPrefix:
            return guide['ID']
    if options['guideRequired'] and options['guides']:
        return options['guides'][0]['ID']
    return NO_GUIDE


# How long a price takes (product_type.Duration, minutes) as the price card and the product's header show it:
#   under HALF_DAY_FROM                   hours and minutes ("2 h 30 min")
#   HALF_DAY_FROM up to FULL_DAY_FROM     "Half day"
#   FULL_DAY_FROM up to one day (24 h)    "Full day"
#   more than a day                       whole days ("2 days"), and a half ("1½ days") or the hours left
#                                         ("1 day and 5 h")
HALF_DAY_FROM = 3 * 60
FULL_DAY_FROM = 6 * 60
DAY = 24 * 60


def time_label(minutes):
    """'2 h 30 min', '2 h', '45 min'"""
    hours, minutes = divmod(minutes, 60)
    if hours and minutes:
        return gettext('%(hours)s h %(minutes)s min', hours=hours, minutes=minutes)
    if hours:
        return gettext('%(hours)s h', hours=hours)
    return gettext('%(minutes)s min', minutes=minutes)


def duration_label(minutes):
    """The duration (minutes) in words, or None when it isn't set"""
    if not minutes or minutes < 1:
        return None
    if minutes < HALF_DAY_FROM:
        return time_label(minutes)
    if minutes < FULL_DAY_FROM:
        return gettext('Half day')
    if minutes <= DAY:
        return gettext('Full day')
    days, rest = divmod(minutes, DAY)
    if rest == 0:
        return ngettext('%(num)s day', '%(num)s days', days)
    if rest == DAY // 2:
        return gettext('%(num)s½ days', num=days)
    return gettext('%(days)s and %(time)s', days=ngettext('%(num)s day', '%(num)s days', days), time=time_label(rest))


def lowest_total(options):
    """The "From" price of the price: the lowest total of a booking booking_quote accepts, so every rule
    counts (who can join, an adult required, a vehicle's seats, a guide required). Free bookings don't
    count: 0 only when every booking is free; None when no booking is possible at all.

    Every price is 0 or more and a total is the sum of its parts (a vehicle or fixed price per person,
    a price per person, a guide), so leaving people out never costs more, and no rule needs more than
    an adult besides. The cheapest booking with a paid part therefore has at most two people: the part
    (a paid person, or one person to go with a paid vehicle / guide / fixed price) and an adult when one
    is required. Trying every group of one or two people with every vehicle and guide finds it."""
    ageIDs = [a['ID'] for a in options['ages']]
    groups = [[a] for a in ageIDs] + [[a, b] for i, a in enumerate(ageIDs) for b in ageIDs[i:]]
    vehicles = [v['ID'] for v in options['vehicles']] if options['basis'] == PRICING_VEHICLE else [None]
    guides = [NO_GUIDE] + [g['ID'] for g in options['guides']]
    lowest, free = None, False
    for ages in groups:
        for vehicleID in vehicles:
            for guideID in guides:
                quote = booking_quote(options, len(ages), vehicleID, guideID, ages)
                if not quote['ok']:
                    continue
                if quote['total'] > 0:
                    lowest = quote['total'] if lowest is None else min(lowest, quote['total'])
                else:
                    free = True
    if lowest is not None:
        return lowest
    return 0 if free else None


def product_lowest_total(productID, languageID):
    """The "From" price of a product (its page's photo header): the lowest lowest_total of its active
    prices in languageID that can be booked now (they have days, booking_date_range), or of all of them
    when none can. (None, 0) when no price can be booked at all.
    Returns (amount, count, duration): count is how many price options the prices have (more than one:
    "From"); duration: the duration_label of the price with that amount (None when it has none)"""
    rows = sqlSelect("""SELECT `product_type_relatives`.`PT_Ref_Key` AS `ptRefKey`
                        FROM `product_type`
                            JOIN `product_type_relatives` ON `product_type_relatives`.`PT_ID` = `product_type`.`ID`
                        WHERE `product_type`.`Product_ID` = %s
                            AND `product_type_relatives`.`Language_ID` = %s
                            AND `product_type`.`Status` = 1;""", (productID, languageID), True)['data']
    bookable, other, count = [], [], 0
    for row in rows:
        options = booking_options(row['ptRefKey'], languageID)
        if options is None:
            continue
        total = lowest_total(options)
        if total is None:
            continue
        if options['basis'] == PRICING_VEHICLE:
            count += len(options['vehicles'])
        elif options['basis'] == PRICING_AGE:
            count += len(options['ages'])
        else:
            count += 1
        (bookable if booking_date_range(options['ptRefKey']) else other).append((total, options['duration']))
    totals = bookable or other
    if not totals:
        return None, 0, None
    paid = [t for t in totals if t[0] > 0]
    total, duration = min(paid or totals, key=lambda t: t[0])
    return total, count, duration_label(duration)


def to_int(value, default=None):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def booking_quote(options, people, vehicleID=None, guideID=NO_GUIDE, ages=None):
    """What booking the price for `people` people costs with these choices.
    ages: the age group (age.ID) of each person, one of the groups that can join.
    Returns {'ok': True, 'total', 'lines': [{'label', 'amount'}], 'people', 'vehicle', 'guide', 'ageCounts'}
    or {'ok': False, 'error': message}"""
    people = to_int(people, 0)
    if people < 1:
        return {'ok': False, 'error': gettext('Something went wrong. Please try again!')}

    lines = []
    total = 0
    vehicle = None
    ageCounts = {}

    # who comes: an allowed age group for every person, an adult when the price requires one
    ages = [to_int(a) for a in (ages or [])]
    offered = {a['ID']: a for a in options['ages']}
    if len(ages) != people or any(a not in offered for a in ages):
        return {'ok': False, 'error': gettext('Please choose the age group of every person!')}
    for a in ages:
        ageCounts[a] = ageCounts.get(a, 0) + 1
    if options['adultRequired'] and not any(offered[a]['Adult'] for a in ages):
        return {'ok': False, 'error': gettext('At least one adult (16+) is required.')}

    if options['basis'] == PRICING_VEHICLE:
        vehicles = {v['ID']: v for v in options['vehicles']}
        vehicle = vehicles.get(to_int(vehicleID))
        if vehicle is None:
            return {'ok': False, 'error': gettext('Please choose a vehicle!')}
        if people > vehicle['Seats']:
            return {'ok': False, 'error': gettext('%(vehicle)s takes at most %(seats)s people.', vehicle=vehicle['Type'], seats=vehicle['Seats'])}
        total += vehicle['Price']
        lines.append({'label': vehicle['Type'] + ' · ' + ngettext('%(num)s seat', '%(num)s seats', vehicle['Seats']), 'amount': vehicle['Price']})
    elif options['basis'] == PRICING_AGE:
        for age in options['ages']:
            count = ageCounts.get(age['ID'], 0)
            if count:
                amount = age['Price'] * count
                total += amount
                lines.append({'label': age['Name'] + ' × ' + str(count), 'amount': amount})
    else:
        total += options['price'] * people
        lines.append({'label': options['title'] + ' × ' + str(people), 'amount': options['price'] * people})

    guide = None
    guideID = to_int(guideID, NO_GUIDE)
    if guideID == NO_GUIDE and options['guideRequired']:
        return {'ok': False, 'error': gettext('A guide is required: please choose a guide language.')}
    if guideID != NO_GUIDE:
        guide = next((g for g in options['guides'] if g['ID'] == guideID), None)
        if guide is None:
            return {'ok': False, 'error': gettext('This guide language is not offered.')}
        total += guide['Price']
        lines.append({'label': gettext('Guide') + ': ' + guide['Language'], 'amount': guide['Price']})

    return {'ok': True, 'total': total, 'lines': lines, 'people': people, 'vehicle': vehicle, 'guide': guide, 'ageCounts': ageCounts}


def booking_choices_error(options, notes, termsAccepted):
    """The notes and terms rules of a booking: an error message or None"""
    if not termsAccepted:
        return gettext('Please agree to the terms and conditions.')
    notes = (notes or '').strip()
    if len(notes) > MAX_NOTES_LENGTH:
        return gettext('The text is too long.')
    if options['notesEnabled'] and options['notesRequired'] and not notes:
        return gettext('Please write the additional notes.')
    return None


def save_booking(pdID, options, quote, notes, termsAccepted, bookingDate):
    """Keeps what was booked with the order pdID (payment_details) for the day bookingDate: booking_details
    and booking_ages.
    The names and prices are copied, so the order still reads the same if they change later.
    Returns the booking_details ID, or None if it couldn't be saved"""
    vehicle, guide = quote['vehicle'], quote['guide']
    notes = (notes or '').strip() if options['notesEnabled'] else ''
    result = sqlInsert("""INSERT INTO `booking_details`
                            (`payment_details_id`, `ptRefKey`, `productTypeID`, `PricingBasis`, `vehicleID`, `vehicleType`,
                             `vehicleSeats`, `vehiclePrice`, `guideLanguageID`, `guideLanguage`, `guidePrice`, `people`,
                             `bookingDate`, `total`, `notes`, `termsAccepted`, `created`)
                          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW());""",
                       (pdID, options['ptRefKey'], options['ptID'], options['basis'],
                        vehicle['ID'] if vehicle else None, vehicle['Type'] if vehicle else None,
                        vehicle['Seats'] if vehicle else None, vehicle['Price'] if vehicle else None,
                        guide['ID'] if guide else NO_GUIDE, guide['Language'] if guide else None, guide['Price'] if guide else 0,
                        quote['people'], bookingDate, quote['total'], notes or None, 1 if termsAccepted else 0))
    if result['status'] == 0:
        return None
    bookingID = result['inserted_id']

    ages = {a['ID']: a for a in options['ages']}
    for ageID, count in quote['ageCounts'].items():
        age = ages[ageID]
        sqlInsert("INSERT INTO `booking_ages` (`bookingID`, `ageID`, `ageGroup`, `people`, `price`) VALUES (%s, %s, %s, %s, %s);",
                  (bookingID, ageID, age['Name'], count, age['Price']))
    return bookingID


def client_options(options, langPrefix):
    """The options as the pages' JavaScript uses them (static/JS/booking.js)"""
    dates = booking_date_range(options['ptRefKey'])
    return {
        'dateMin': dates[0].isoformat() if dates else None,
        'dateMax': dates[1].isoformat() if dates else None,
        'ptRefKey': options['ptRefKey'],
        'basis': options['basis'],
        'price': options['price'],
        'from': lowest_total(options),
        'duration': duration_label(options['duration']),
        'notesEnabled': options['notesEnabled'],
        'notesRequired': options['notesRequired'],
        'guideRequired': options['guideRequired'],
        'adultRequired': options['adultRequired'],
        'vehicles': [{'ID': v['ID'], 'Type': v['Type'], 'Seats': v['Seats'], 'Price': v['Price'],
                      'SeatsLabel': ngettext('%(num)s seat', '%(num)s seats', v['Seats'])} for v in options['vehicles']],
        'ages': options['ages'],
        'guides': [{'ID': g['ID'], 'Language': g['Language'], 'Price': g['Price']} for g in options['guides']],
        'defaultGuide': default_guide(options, langPrefix),
    }


def get_bookings(pdID):
    """What was booked with the order pdID (staff order details): one booking_details row per booking (an
    order from the cart's "Book all" has several), each with 'ptTitle' / 'prTitle' (the price and its
    product as named now) and 'ages': [{ageGroup, people, price}]"""
    bookings = sqlSelect("""SELECT `booking_details`.*, `product_type`.`Title` AS `ptTitle`, `product`.`Title` AS `prTitle`
                            FROM `booking_details`
                                LEFT JOIN `product_type` ON `product_type`.`ID` = `booking_details`.`productTypeID`
                                LEFT JOIN `product` ON `product`.`ID` = `product_type`.`Product_ID`
                            WHERE `booking_details`.`payment_details_id` = %s
                            ORDER BY `booking_details`.`bookingDate`, `booking_details`.`ID`;""", (pdID,), True)['data']
    for booking in bookings:
        booking['ages'] = sqlSelect("SELECT `ageGroup`, `people`, `price` FROM `booking_ages` WHERE `bookingID` = %s ORDER BY `ageID`;",
                                    (booking['ID'],), True)['data']
    return bookings


# ---- The tickets of an order (the client's confirmation page): what the price card showed ----
SPSS_BOOL, SPSS_DATE, SPSS_DATETIME, SPSS_LOCATION = 3, 4, 5, 6   # spss_category (app.py SPSS_*)


def spss_ticket_value(categoryID, value):
    """A specification value as the ticket shows it: (text, link or None)"""
    value = (value or '').strip()
    if categoryID == SPSS_BOOL:
        return (gettext('Yes') if value == '1' else gettext('No') if value == '0' else value), None
    if categoryID == SPSS_LOCATION and value.lower().startswith('https://'):
        return gettext('Map'), value
    try:
        if categoryID == SPSS_DATE:
            return format_date(date.fromisoformat(value), 'long'), None
        if categoryID == SPSS_DATETIME:
            return format_datetime(datetime.strptime(value, '%Y-%m-%d %H:%M'), 'medium'), None
    except ValueError:
        pass
    return value, None


def booking_ticket_rows(booking, languageID, currency):
    """What a ticket says about one booking of an order (get_bookings row), in languageID: [[label, value, link]]
    - the event, its day and duration, who comes, the vehicle, the guide, the client's notes, the price, and
    the price's specifications (as on the service page's price card; their values in languageID)"""
    pt = sqlSelect("""SELECT `product_type`.`ID`, `product_type`.`Title` AS `ptTitle`, `product_type`.`Duration`,
                             `product`.`Title` AS `prTitle`
                      FROM `product_type_relatives`
                          JOIN `product_type` ON `product_type`.`ID` = `product_type_relatives`.`PT_ID`
                          LEFT JOIN `product` ON `product`.`ID` = `product_type`.`Product_ID`
                      WHERE `product_type_relatives`.`PT_Ref_Key` = %s AND `product_type_relatives`.`Language_ID` = %s
                      LIMIT 1;""", (booking['ptRefKey'], languageID), True)['data']
    pt = pt[0] if pt else {'ID': booking['productTypeID'], 'ptTitle': booking.get('ptTitle'), 'prTitle': booking.get('prTitle'),
                           'Duration': None}
    rows = [[gettext('Event'), ': '.join(t for t in (pt['prTitle'], pt['ptTitle']) if t), None]]
    if booking['bookingDate']:
        rows.append([gettext('Date'), format_date(booking['bookingDate'], 'full'), None])
    duration = duration_label(pt['Duration'])
    if duration:
        rows.append([gettext('Duration'), duration, None])
    who = ', '.join(f"{a['ageGroup']} × {a['people']}" for a in booking['ages'])
    people = ngettext('%(num)s person', '%(num)s people', booking['people'])
    rows.append([gettext('People'), f'{who} ({people})' if who else people, None])
    if booking['vehicleType']:
        rows.append([gettext('Vehicle'), booking['vehicleType'] + ' · ' + ngettext('%(num)s seat', '%(num)s seats', booking['vehicleSeats'] or 0), None])
    rows.append([gettext('Guide'), booking['guideLanguage'] or gettext('No guide'), None])
    if booking['notes']:
        rows.append([gettext('Additional notes'), booking['notes'], None])
    total = float(booking['total'] or 0)
    amount = f"{total:,.0f}" if total.is_integer() else f"{total:,.2f}"
    rows.append([gettext('Price'), f'{currency} {amount}' if total > 0 else gettext('Free'), None])

    specs = sqlSelect("""SELECT `sub_product_specifications`.`Name`, `sub_product_specifications`.`spssCategoryID`,
                                `product_type_details`.`Text`
                         FROM `product_type_details`
                             JOIN `sub_product_specifications` ON `sub_product_specifications`.`ID` = `product_type_details`.`spssID`
                                 AND `sub_product_specifications`.`Status` = 1
                         WHERE `product_type_details`.`productTypeID` = %s
                         ORDER BY `sub_product_specifications`.`Order`;""", (pt['ID'],), True)['data']
    for spec in specs:
        if (spec['Text'] or '').strip():
            text, link = spss_ticket_value(spec['spssCategoryID'], spec['Text'])
            rows.append([spec['Name'], text, link])
    return rows


def order_tickets(pdID, languageID, currency):
    """The tickets of the order pdID: one per booking for every ticket holder (event_clients: each person on
    the buy-now page, the lead contact of a "Book all" order), [{'rows': [[label, value, link]]}] with the
    holder's name first. [] for an order without booking details (made before bookings were kept)"""
    bookings = get_bookings(pdID)
    if not bookings:
        return []
    holders = sqlSelect("""SELECT `clients`.`FirstName`, `clients`.`LastName`
                           FROM `event_clients`
                               LEFT JOIN `clients` ON `clients`.`ID` = `event_clients`.`clientID`
                           WHERE `event_clients`.`payment_details_id` = %s
                           ORDER BY `event_clients`.`ID`;""", (pdID,), True)['data'] or [{'FirstName': '', 'LastName': ''}]
    tickets = []
    for booking in bookings:
        rows = booking_ticket_rows(booking, languageID, currency)
        for holder in holders:
            name = ' '.join(n for n in (holder['FirstName'], holder['LastName']) if n)
            tickets.append({'rows': [[gettext('Name'), name, None]] + rows})
    return tickets

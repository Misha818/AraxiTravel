Installs all you need to run your flask app
pip install -r requirements.txt

==========================================

MULTILINGUAL SITE WITH FLASK BABEL
https://python-babel.github.io/flask-babel/

# Install Flask Babel
pip install Flask-Babel

# Directories
# Create /translations directory at the root of the project

# Create /lg directory for each supported language (e.g. /en, /hy,…)

# Create /LC_MESSAGES folder under each supported language add & configure babel.cfg file at the root of the project
[jinja2: templates/**.html]
[python: **.py]

# Extract text strings from our HTML templates and .py files
# It creates a messages.pot file
pybabel extract -F babel.cfg -o messages.pot . 

# Then initialize language translation files, it will create a .po file, here for Armenian (hy)
pybabel init -i messages.pot -d translations -l hy

# Note: if you want to later update the .po file after creating a new messages.pot file
pybabel update -d translations -i messages.pot -l fr

# Translate the strings
# Then translate all the msgid entries in the .po file as msgstr


# Finally, compile the .po file to a .mo file
pybabel compile -d translations

# Don't forget to import babel as shown in our boilerplate
# from flask_babel import Babel, _,lazy_gettext as _l, gettext

============================================================
DATABASE INSTALATION

Restore the database from the dump. Open the CMD in current folder and run the following command
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS araxitravel_db"
mysql -u root -p araxitravel_db < Dump.sql

==============================================================
Ngnx image dir permissions.

# recursively hand ownership to your service user
sudo chown -R www-data:www-data /var/www/araxitravel/static/images

# directories need `+x` so they can be entered
sudo find /var/www/araxitravel/static/images -type d -exec chmod 755 {} \;

# files only need read/write
sudo find /var/www/araxitravel/static/images -type f -exec chmod 644 {} \;


-------------------

# Make www-data own the folder (and everything inside)
sudo chown -R www-data:www-data /var/www/araxitravel/static/images

# Give owner (www-data) and group (www-data) read/write/execute,
# others read/execute only:
sudo chmod -R 775 /var/www/araxitravel/static/images


======================

# 1. Update your remote‐tracking branch
<!-- git fetch origin -->
sudo -u araxitravel git fetch origin

# 2. Discard any staged changes in templates/ and reset them to origin/main
sudo -u araxitravel git restore --source=origin/main --staged -- templates/
sudo -u araxitravel git restore --source=origin/main --staged -- static/css/styles.css
<!-- sudo -u araxitravel git restore --source=origin/main --staged --worktree -- templates/ -->

# 3. Discard any unstaged (working‐tree) changes in templates/
git restore --source=origin/main -- templates/

======================

# Instal and run redis server

sudo apt update
sudo apt install redis-server

sudo systemctl enable redis-server
sudo systemctl start  redis-server
======================

# Content-Security-Policy (templates and JavaScript rules)

The app sends a strict CSP header (see CSP_POLICY in app.py). The browser only runs
scripts that carry this request's nonce, so:

- Every <script> tag needs the nonce, inline or external:
  <script nonce="{{ csp_nonce() }}">...</script>
  <script nonce="{{ csp_nonce() }}" src="..."></script>

- Inline event handlers (onclick="...", onchange="...") do not run. Use addEventListener,
  or the declarative attributes handled by static/JS/security.js:
  <i data-onclick='["sortTable", "$this", 0, "up"]'></i>
  <select data-onchange='["navigate", "/setlang?lang=", "$value"]'>
  A function called this way must be a global function AND be listed in
  ALLOWED_ACTIONS in static/JS/security.js.

- Server data placed into innerHTML / HTML template strings goes through
  escapeHtml(value); server answers (response.answer) through safeMessage(answer).
  Plain text is better set with element.textContent.

- Server data embedded in a script: JSON.parse({{ jsonString | tojson }}),
  never JSON.parse(`{{ jsonString|safe }}`).

- New external CSS/fonts/APIs must be added to the matching directive in CSP_POLICY.

To find violations without blocking anything, set CSP_REPORT_ONLY=1 in .env:
the browser console then lists what would have been blocked.

======================

# Database connection pool (araxitravel_db.py)

Each gunicorn worker is a separate process with its own pool, so the server opens up to

    workers x MYSQL_POOL_SIZE   database connections

and that must stay below MySQL's max_connections (151 by default; check with
SHOW VARIABLES LIKE 'max_connections';). Leave some room for admin tools and cron jobs.

Optional .env settings:
- MYSQL_POOL_SIZE    (default 5)  connections per process. A sync gunicorn worker handles
                                  one request at a time and a request uses one connection,
                                  so 5 workers x 5 = 25 connections is plenty.
- MYSQL_POOL_TIMEOUT (default 10) seconds a request waits for a free connection; after that
                                  the visitor gets "server busy" (HTTP 503) instead of the
                                  worker hanging. Errors are logged as
                                  "No free database connection after ...".

If you add more workers or switch to threaded workers (--threads N), raise the pool size
so that pool size >= threads per worker, and keep workers x pool size under max_connections.

======================

# Rate limiting (login) and the visitor's real IP

Login limits (LOGIN_ATTEMPTS_PER_IP / LOGIN_FAILURES_PER_ACCOUNT in app.py; viewing the
login page is not counted):
- 5 login attempts per minute per visitor IP.
- 10 failed passwords per account per 15 minutes, whatever IP they come from. After that
  every login to that account is refused until the 15 minutes pass (even with the right
  password), which stops password guessing spread over many IPs. Only attempts that passed
  the Turnstile human check and then had a wrong password count, so an account cannot be
  locked just by sending junk requests. To unlock an account early, delete its counter in
  Redis (keys containing "login-user:<username>") or wait.

Production .env settings:

- RATELIMIT_STORAGE_URI=redis://localhost:6379/1
  Counters are stored in Redis so all gunicorn workers share them. Without it (default
  "memory://") each worker counts on its own and "5 per minute" becomes 5 per worker.
  If Redis goes down, the app keeps working and falls back to per-worker counting.
  (Redis install steps are above.)

- PROXY_COUNT=<number of proxies in front of the app>
  Behind nginx, every request seems to come from 127.0.0.1, so all visitors would share
  one limit (and Turnstile would get the wrong IP). The app reads the real IP from
  X-Forwarded-For when this is set:
    0  app reached directly (local development, default)
    1  nginx only
    2  Cloudflare -> nginx (current production setup)
  Never set it higher than the real number of proxies: visitors could then fake their IP.
  With 2, also make sure the server only accepts web traffic from Cloudflare's IP ranges
  (firewall), otherwise someone hitting the server IP directly can fake X-Forwarded-For.

======================

# Checkout: how a sale is recorded (stock, payment, confirmation page)

A checkout (POST /checkout in app.py, used by checkout.html and buy-now.html) runs in
this order:

  1. Reserve the stock - insertIntoBuffer (sysadmin.py) subtracts the ordered units from
     table `quantity` and notes them in `buffer_store` for this order (payment_details ID),
     so nobody else can buy them.
  2. Take the payment - still a stand-in: bank_answer_status = 1 means "paid" and no money
     is taken.
  3. Record the sale - insertPUpdateP (sysadmin.py):
       a. mark the order paid (`payment_details`.Status 1 -> 2, price, method, time)
       b. write the order lines to `purchase_history`
       c. if an affiliate's promo code was used, write the rewards to `affiliate_history`
  4. Save the confirmation-page link (`pd_buffer`) and send the customer to
     /confirmation-page/<link>.

Order statuses used here (`payment_details`.Status): 1 = waiting for payment,
2 = paid, 0 = cancelled.

## What was wrong (before)

- Step 3 made three separate writes, each committed on its own. If one failed, the route
  answered "Something went wrong. Please try again!" but:
    - the reserved stock was never given back (and every retry reserved more),
    - half of the sale could stay in the database (order lines, or even affiliate rewards,
      for an order that never completed),
    - the "mark paid" update was not checked at all.
- An affiliate order without any discounted line always failed in step 3c (an INSERT with
  an empty VALUES list).
- Nothing stopped the same order from being recorded twice (double submit / retry).
- If step 4 failed, a customer who had just paid was told to "try again" and could pay twice.

## What was changed

1. Step 3 is all or nothing (insertPUpdateP, sysadmin.py). 3a, 3b and 3c run in ONE
   database transaction on the request's connection and are committed once at the end. If
   anything fails, everything is rolled back and the error is logged ("Recording the sale
   failed and was rolled back"). sqlInsert/sqlUpdate commit on their own, so step 3 talks
   to the connection directly.
2. Every write in step 3 is checked:
    - the order is marked paid only if it is still waiting for payment (Status = 1); a
      second call for the same order changes nothing and is rolled back,
    - the number of rows written must match the number of rows expected,
    - the affiliate rewards are only written when there are discounted lines.
3. The checkout route decides what happens to the stock when step 3 fails (app.py):
    - no money taken (today, the bank step is a stand-in): the stock is given back and the
      order cancelled - deletePUpdateP(pdID, removeSaleRecords=True);
    - money taken (once a real bank is connected): the order is NOT cancelled. It stays
      "waiting for payment" with its stock reserved, an error is logged for staff ("payment
      received but recording the sale failed") and the customer sees "Your payment was
      received, but we couldn't complete your order. Please don't pay again: our team will
      contact you." Staff then finish the order or refund it.
   When the bank is connected, set `paymentTaken` (in /checkout) from the bank's answer.
4. Safety net (deletePUpdateP, sysadmin.py): the new option removeSaleRecords=True also
   deletes the order's `purchase_history` and `affiliate_history` rows, so a failed checkout
   can never leave sale records behind. It is used ONLY for failed checkouts. Staff
   cancelling a real order (order details page) still calls deletePUpdateP(pdID) without it:
   those rows are the order's history - an affiliate's "Voided" rewards are counted from
   them, and un-cancelling the order (reservePUpdateP) needs them.
5. Step 4 never tells a paying customer to try again (app.py, checkout.html, buy-now.html):
    - saving the confirmation link is tried up to 3 times, each with a fresh random link,
    - if it still fails, the order stays paid and recorded, an error is logged ("paid and
      recorded, but its confirmation-page link could not be saved. Send the customer the
      order details") and the answer is "paid" (status 1) without a link. The page then
      shows "Your payment was received and your order is confirmed, but we couldn't open
      your order page. Please don't pay again: our team will send you the order details.
      Order number: <n>", empties the cart and keeps the pay button hidden.

New customer messages are translated in translations/{en,hy,ru} (restart the app after
compiling: pybabel compile -d translations).

## Scenarios (all tested on the real database inside a transaction that was rolled back)

Recording the sale (insertPUpdateP / deletePUpdateP), 2 units reserved, stock 98 -> 96,
affiliate promo code MMM:

  S1  normal payment                      -> paid, 1 order line, 1 affiliate reward, stock 96
  S2  same order recorded again           -> refused, nothing written twice
  S3  affiliate rewards insert fails      -> nothing written, order still waiting;
                                             then the failed-checkout cleanup gives the
                                             stock back (98) and cancels the order
  S4  order lines insert fails            -> nothing written, order still waiting
  S5  paid, then staff cancel (default)   -> stock back, order cancelled,
                                             order line and reward KEPT (history)
  S6  paid, then removeSaleRecords=True   -> stock back, order line and reward removed
  S7  affiliate order, no discounted line -> paid, no reward (used to fail)

Whole checkout (POST /checkout), 1 unit, stock 100:

  R1  everything works                    -> answer "paid" with link, order paid,
                                             link saved, stock 99
  R2  saving the link fails 3 times       -> answer "paid" WITHOUT link + the
                                             "don't pay again ... Order number" message;
                                             order paid and recorded, stock 99
  R3  saving the link fails once          -> the retry saves it: "paid" with link
  R4  recording the sale fails            -> "Something went wrong. Please try again!",
                                             order cancelled, nothing recorded,
                                             stock back to 100

What to watch in the logs (app logger, level ERROR): "payment received but recording the
sale failed" and "confirmation-page link could not be saved" - both name the order number
and need a person to follow up.

## Step 1 (reserving the stock) is all or nothing too

What was wrong in insertIntoBuffer (sysadmin.py):
- It subtracted the stock BEFORE checking that a payment method was chosen for a paid
  order. When that check failed ("buffer_3") it returned an error without writing the
  `buffer_store` rows, so those units were lost for good - nothing could give them back.
- The `buffer_store` insert was not checked: if it failed, the stock was already taken and
  the function still answered "success".
- Stock was written as an absolute number read a moment earlier
  (Quantity = <old value> - n). Two buyers at the same time overwrote each other and the
  same units could be sold twice.
- If a requested price had fewer units than ordered, it reserved what it found (or nothing)
  and carried on with a half order.
- The card-detail checks returned their message under a misspelled key ('amswer'), which
  would have crashed the request (that path is not active yet).
- When the reservation was refused, the order row created just before it
  (`payment_details`, Status 1) stayed "waiting for payment" forever.

What it does now:
1. Plan first, write nothing: work out which stock rows give how many units and the total
   price. Every requested unit must be covered ("buffer_4" otherwise), and the payment-method
   check ("buffer_3") runs here - so a refused order never touches the stock.
2. Then reserve in ONE transaction, committed once: each stock row is decreased relative to
   its current value and only while it still has enough
   (Quantity = Quantity - n WHERE Quantity >= n), every update is checked, then the
   `buffer_store` rows are written and checked. Any failure rolls everything back ("buffer_5"
   and "Reserving the stock failed and was rolled back" in the log).
3. The checkout route cancels the new order (Status 1 -> 0) whenever nothing was reserved.

Markers printed by insertIntoBuffer when it refuses an order (server output):
  buffer_1  the requested prices have no stock (or wrong language / expired)
  buffer_2  more units than the stock or the one-purchase limit allows
  buffer_3  a paid order without a payment method
  buffer_4  not every requested unit could be covered
  buffer_5  the reservation failed and was rolled back (e.g. someone else bought the units)

Scenarios (whole checkout, POST /checkout, tested on the real database inside a transaction
that was rolled back; price "1 to 4 person", stock 100):

  B1  normal checkout                      -> paid, stock 99, 1 reserved row, 1 order line
  B2  no payment method chosen             -> "Something went wrong", stock stays 100,
                                              order cancelled, nothing reserved (this used
                                              to lose the units)
  B3  buffer_store insert fails            -> rolled back: stock stays 100, order cancelled
  B4  another buyer takes the units between
      planning and reserving               -> the guarded update notices ("no longer has
                                              1 units"), rolled back, order cancelled
  B5  more units than in stock             -> refused before anything is written

======================

# Max allowed quantity for one purchase (MAX_ALLOWED_QUANTITY in .env)

    MAX_ALLOWED_QUANTITY=20      (default 20 when missing or not a positive whole number)

- Add to Store: "Max allowed quantity for one purchase is" is ticked by default and filled
  with this number; Edit Store offers it when the box is ticked on stock saved without a
  limit.
- Stock saved without a limit is capped at this number everywhere a purchase quantity is
  decided: the service page's "for N person" dropdown, add to cart / buy now, the cart page
  and the final check at checkout. Without the cap the dropdown listed every unit in stock
  (e.g. 45,410 options). Stock with its own limit keeps it.
- Defined in sysadmin.py (the checkout check lives there); app.py imports it.
  Restart the app after changing it.

======================

# Home page slide images (Staff > Slides)

Recommended: 3200 x 1800 px (16:9), JPEG at 80-85% quality, ideally under 1 MB.
Minimum: 2560 x 1440. Larger than 3840 x 2160 brings no benefit.

Why this size: the landing slider (static/JS/landing.js) never shows the whole image. It
fills the screen and slowly pans across a slightly zoomed view, so the image has to be
larger than the screen:

    Screen                                 Part of the image width   Width needed to stay sharp
    1920 x 1080 monitor                    ~75%                      ~2600 px
    Laptop at 150% scaling (1536 x 864)    ~75%                      ~3100 px
    2560 x 1440 monitor                    ~75%                      ~3400 px
    Phone, portrait (390 x 844 at 2x)      ~25%, then it pans        ~3100 px

- landing.js downscales anything wider than 2560 px on phones/tablets and 4096 px on
  desktops, so 3200 px is sharp almost everywhere without downloading unused pixels.
- Composition: title and button sit bottom-left over a dark gradient - keep faces and key
  details out of the lower-left third. About 3% is trimmed at the top and bottom and the
  header covers the top strip. On phones the camera pans across the whole width, so wide
  landscapes work best.
- Upload: the cropper in add_slide.html / edit_slide.html (croppedSlideBlob) saves the crop
  as JPEG at 85% quality, at most 3200 px wide (1800 px high at 16:9) - a full-width crop of
  a large photo is roughly 0.3-1 MB. Smaller crops keep their own size (no upscaling) and
  transparent PNG areas become white. The original file may be up to 20 MB, because only
  the cropped JPEG is uploaded. The server does not resize slides.
  Cropper.js 1.5.12 note: its maxWidth/maxHeight options upscale small crops and, used
  together, shrink large ones too far, so the output size is passed explicitly.


======================

# Slide title/subtitle formatting (Staff > Slides > Add / Edit Slide)

Bold, italic, underline and colour (the round Pickr colour picker in the toolbar) can be applied
to the whole title/subtitle or to selected words. With nothing selected the toolbar formats the
whole field; the line under the toolbar says which ("whole title" or the selected words).
Undo/redo: the arrow buttons or Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z), up to 200 steps per field.
When the whole text has a single colour it is saved in Title_Color / Subtitle_Color as before
(#rrggbb, or #rrggbbaa if transparent); otherwise each part keeps its colour in the runs.

Database change (needed once on every server, e.g. production, before deploying this code):

    ALTER TABLE `home_slide`
        ADD COLUMN `Title_Format` TEXT NULL AFTER `Title_Color`,
        ADD COLUMN `Subtitle_Format` TEXT NULL AFTER `Subtitle_Color`;

- Title / Subtitle keep the plain text (slide list, alt text and old slides are unchanged);
  Title_Format / Subtitle_Format hold the formatting as JSON runs, NULL when there is none:
      [{"t": "Discover ", "b": 1, "c": "#3498db"}, {"t": "Armenia", "i": 1, "u": 1}, {"t": " with us"}]
  t = text, b/i/u = bold/italic/underline, c = colour.
- Saving: sanitize_text_format() in sysadmin.py keeps only those keys, only #hex/rgb()/rgba()
  colours, and drops the formatting if the runs do not spell exactly the saved text.
- Display: static/JS/landing.js builds the title with textContent (no HTML), so formatting
  cannot inject markup; if the formatting does not match the text, the plain text is shown.
- Editor: static/JS/slide-text-editor.js (Quill 1.3.6, one line, max 255 characters) and
  static/css/slide-form.css, shared by add_slide.html and edit_slide.html.

# Prices by vehicle / age group, guide prices, notes settings (Staff > Add / Edit Price, Vehicles)

Add Price and Edit Price set a price in one of three ways (product_type.PricingBasis):
0 = fixed (product_type.Price), 1 = by vehicle (v_price, per vehicle), 2 = by age group
(age_price, per person). Guide prices (guide_price, per group) work with any of them; the guide
languages are every row of `languages`, and "No guide" is not stored (offered for free unless
product_type.GuideRequired is 1: then the client must choose a guide language, and the product
header's "From" price includes the cheapest guide).
In every price table an option without a row is not offered, and 0 means free. The rows belong to
one language's product_type, so each language version has its own prices.
- With vehicle / age pricing product_type.Price only keeps the lowest non-zero option price; the
  final price is worked out from the options. The product header's "From" price is the lowest
  non-zero price over all of them (products.productHeaderData).
- Vehicles: Staff > Vehicles (Editor role), one `vehicle` row per language linked by
  vehicle_relatives.Ref_Key; the name is per language, Seats / Order / Status are shared.
- Age groups: the `age` table (Infant 0-2, Child 3-11, Teen 12-15, Adult 16-64, Senior 65+); their
  names are translated in the .po files (templates/_price_options.html).
- Who can join: with fixed and vehicle pricing the allowed age groups are pt_age rows ("Who can
  join" checkboxes, all checked by default); with age group pricing the groups that have a price
  (empty = not allowed, 0 = free). Everyone counts toward the group size, the vehicle's seats and
  the stock, infants too. product_type.AdultRequired: a booking needs an Adult or a Senior.
- product_type.NotesEnabled / NotesRequired: whether the client can / must write notes.
- Specification fields are shown by their category (Text, Number, Yes/No, Date, Date and time,
  Location). A Location is an address or a Google Maps link (pasted "Embed a map" code is turned
  into its link); it is shown with Google's key-free embedded map, so the
  Content-Security-Policy allows frames from www.google.com and maps.google.com.
- Code: helpers above price_header_product() in app.py, templates/_price_options.html,
  static/JS/price-options.js, static/css/price-options.css, templates/vehicles.html, vehicle.html.

Database change (needed once on every server, e.g. production, before deploying this code;
Dump.sql already has it for new databases):

    ALTER TABLE `product_type`
        ADD COLUMN `PricingBasis` INT NOT NULL DEFAULT 0,
        ADD COLUMN `NotesEnabled` INT NOT NULL DEFAULT 1,
        ADD COLUMN `NotesRequired` INT NOT NULL DEFAULT 0,
        ADD COLUMN `GuideRequired` INT NOT NULL DEFAULT 0,
        ADD COLUMN `AdultRequired` INT NOT NULL DEFAULT 0;

    ALTER TABLE `product_type_details` MODIFY `Text` TEXT;

    CREATE TABLE `vehicle` (
        `ID` INT AUTO_INCREMENT,
        `Type` VARCHAR(255),
        `Seats` INT,
        `Order` INT,
        `Status` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    CREATE TABLE `vehicle_relatives` (
        `ID` INT AUTO_INCREMENT,
        `Ref_Key` INT,
        `Vehicle_ID` INT,
        `Language_ID` INT,
        `User_ID` INT,
        `Status` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    CREATE TABLE `v_price` (
        `ID` INT AUTO_INCREMENT,
        `Price` INT,
        `vehicleID` INT,
        `productTypeID` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    CREATE TABLE `age` (
        `ID` INT AUTO_INCREMENT,
        `ageGroups` VARCHAR(255),
        `ageRange` VARCHAR(255),
        `Order` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    CREATE TABLE `age_price` (
        `ID` INT AUTO_INCREMENT,
        `Price` INT,
        `ageID` INT,
        `productTypeID` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    CREATE TABLE `pt_age` (
        `ID` INT AUTO_INCREMENT,
        `ageID` INT,
        `productTypeID` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    CREATE TABLE `guide_price` (
        `ID` INT AUTO_INCREMENT,
        `Price` INT,
        `languageID` INT,
        `productTypeID` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    INSERT INTO `age` (`ageGroups`, `ageRange`, `Order`)
    VALUES
        ('Infant', '0-2', 0),
        ('Child', '3-11', 1),
        ('Teen', '12-15', 2),
        ('Adult', '16-64', 3),
        ('Senior', '65+', 4);

    -- existing prices: fixed and vehicle prices let every age group join
    INSERT INTO `pt_age` (`ageID`, `productTypeID`)
    SELECT `age`.`ID`, `product_type`.`ID` FROM `product_type` CROSS JOIN `age`
    WHERE IFNULL(`product_type`.`PricingBasis`, 0) IN (0, 1);

    INSERT INTO `actions` (`ID`, `Action`, `ActionDir`, `ActionName`, `ActionGroup`, `ActionType`, `Img`)
    VALUES
        (89, 'vehicles', 'vehicles', 'Vehicles', 20, 1, 'fas fa-car'),
        (90, 'add_vehicle_view', 'add-vehicle', 'Add Vehicle', 20, 1, 'fas fa-plus'),
        (91, 'add_vehicle', 'add_vehicle', 'Add Vehicle', 20, 2, ''),
        (92, 'edit_vehicle_view', 'edit-vehicle/', 'Edit Vehicle', 20, 2, ''),
        (93, 'edit_vehicle', 'edit_vehicle', 'Edit Vehicle', 20, 2, '');

    UPDATE `rol` SET `ActionIDs` = CONCAT(`ActionIDs`, ',89,90,91,92,93') WHERE `Rol` = 'Editor' AND NOT FIND_IN_SET('89', `ActionIDs`);

# Booking on the service page and buy-now page (vehicle, age groups, guide, notes, terms)

- Service page (slideshow.html): each price card asks who is coming (a - / + counter per age group
  that can join; it replaces the people dropdown, the stock / order limit and the vehicle's seats
  cap the total), offers its vehicles and its guides ("No guide" or a guide language; the page's
  language is chosen first when it is offered) and the day (from tomorrow up to the last day of the
  price's valid stock, quantity.expDate). "Book Now" opens /buy-now/<PT_Ref_Key>-<people>?vehicle=
  <vehicle ID>&guide=<languages.Language_ID>&ages=<age ID>:<count>,...&date=<YYYY-MM-DD>; "Add to cart"
  keeps the same choices in the cart (cart.py, cookie araxi_cart; /cart books each one with that link).
  When the cart already has a booking for the same day, the client is asked to confirm (/cart/date-check).
- Buy-now page: the same counters, vehicle and guide; the counters add and remove the tickets (one per
  person, each labelled with its age group); the client's additional notes (when the price allows
  them; required if set so); the terms and conditions checkbox (required, links to /terms). The
  price is shown from /booking-quote.
- booking.py works out every booking's price (booking_quote): fixed = Price x people, vehicle = the
  vehicle's price, age group = the sum of each person's age group price; + the guide's price (per
  group). Every booking gives each person's age group (one that can join) and needs an adult when
  the price requires one. /checkout, the promo code check and both pages use it, so the amount charged is always the
  server's. One person is still one ticket and one unit of stock; each unit is charged total / people.
- What was booked is kept with the order in booking_details / booking_ages (names and prices copied)
  and shown to staff on Orders > order details.
- Code: booking.py, static/JS/booking.js, static/css/booking.css, templates/_booking_text.html.

Database change (needed once on every server, e.g. production, before deploying this code;
Dump.sql already has it for new databases):

    CREATE TABLE `booking_details` (
        `ID` INT AUTO_INCREMENT,
        `payment_details_id` INT,
        `ptRefKey` INT,
        `productTypeID` INT,
        `PricingBasis` INT,
        `vehicleID` INT,
        `vehicleType` VARCHAR(255),
        `vehicleSeats` INT,
        `vehiclePrice` INT,
        `guideLanguageID` INT,
        `guideLanguage` VARCHAR(100),
        `guidePrice` INT,
        `people` INT,
        `bookingDate` DATE,
        `total` FLOAT,
        `notes` TEXT,
        `termsAccepted` INT,
        `created` DATETIME,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

    CREATE TABLE `booking_ages` (
        `ID` INT AUTO_INCREMENT,
        `bookingID` INT,
        `ageID` INT,
        `ageGroup` VARCHAR(255),
        `people` INT,
        `price` INT,
        PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB;

  If booking_details was created before the booking day was added:

    ALTER TABLE `booking_details` ADD `bookingDate` DATE AFTER `people`;

  If product_type was created before a price had a duration (minutes; Add / Edit Price "Duration"):

    ALTER TABLE `product_type` ADD `Duration` INT AFTER `AdultRequired`;

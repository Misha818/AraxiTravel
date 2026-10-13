-- Drop the existing database if it exists
DROP DATABASE IF EXISTS `araxitravel_db`;

-- Create the database again
CREATE DATABASE `araxitravel_db`
    DEFAULT CHARACTER SET utf8
    DEFAULT COLLATE utf8_general_ci;

-- Select the newly created database
USE `araxitravel_db`;

-- Drop tables if they exist and create them again
DROP TABLE IF EXISTS `product`;
CREATE TABLE `product` (
    `ID` INT NOT NULL AUTO_INCREMENT,
    `Title` VARCHAR(255),
    `Url` VARCHAR(255),
    `AltText` VARCHAR(255),
    `Thumbnail` VARCHAR(255),
    `Slides` TEXT,
    `ShortDescription` VARCHAR(255) NOT NULL,
    `LongDescription` TEXT NOT NULL,
    `Text` TEXT,
    `DatePublished` DATE,
    `DateModified` DATE,
    `Order` INT NOT NULL,
    `Product_Category_ID` INT,
    `Product_Status` INT,
    `Language_ID` INT,
    `User_ID` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `product` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `product_type`;
CREATE TABLE `product_type` (
    `ID` INT AUTO_INCREMENT,
    `Price` FLOAT,
    `Title` VARCHAR(255),
    `payment_methods` VARCHAR(255),
    `Description` TEXT,
    `Order` INT,
    `User_ID` INT,
    `Product_ID` INT,
    `spsID` INT,
    -- `Slides` TEXT,
    -- `Language_ID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `product_type` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `home_slide`;
CREATE TABLE `home_slide` (
    `ID` INT AUTO_INCREMENT,
    `Title` VARCHAR(255) NOT NULL,
    `Title_Color` VARCHAR(20) NOT NULL,
    `Title_Format` TEXT NULL,       -- JSON runs: bold/italic/underline/colour of parts of the title
    `Subtitle` VARCHAR(255) NOT NULL,
    `Subtitle_Color` VARCHAR(20) NOT NULL,
    `Subtitle_Format` TEXT NULL,    -- same for the subtitle
    `URL` VARCHAR(255) NOT NULL,
    `IMG` VARCHAR(255),
    `Alt_Text` VARCHAR(255),
    `Start_Date` DATE,
    `Exp_Date` DATE,
    `Order` INT,
    `User_ID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `home_slide` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `home_slide_relatives`;
CREATE TABLE `home_slide_relatives` (
    `ID` INT AUTO_INCREMENT,
    `HS_Ref_Key` INT,
    `HS_ID` INT,
    `Language_ID` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `home_slide_relatives` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `product_type_relatives`;
CREATE TABLE `product_type_relatives` (
    `ID` INT AUTO_INCREMENT,
    `PT_Ref_Key` INT,
    `User_ID` INT,
    `PT_ID` INT,
    `Language_ID` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `product_type_relatives` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `product_category`;
CREATE TABLE `product_category` (
    `Product_Category_ID` INT NOT NULL AUTO_INCREMENT,
    `Product_Category_Name` VARCHAR(255),
    `Product_Category_Images` TEXT,
    `AltText` VARCHAR(255),
    `User_ID` INT,
    `spsID` INT,
    `xRatio` INT,
    `yRatio` INT,
    `Product_Category_Status` INT,
    PRIMARY KEY (`Product_Category_ID`)
) ENGINE=InnoDB;
ALTER TABLE `product_category` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `product_c_relatives`;
CREATE TABLE `product_c_relatives` (
    `product_c_relatives_ID` INT AUTO_INCREMENT,
    `PC_Ref_Key` INT,
    `User_ID` INT,
    `PC_ID` INT,
    `Language_ID` INT,
    PRIMARY KEY (`product_c_relatives_ID`)
) ENGINE=InnoDB;
ALTER TABLE `product_c_relatives` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `product_relatives`;
CREATE TABLE `product_relatives` (
    `product_relatives_ID` INT AUTO_INCREMENT,
    `P_Ref_Key` INT,
    `User_ID` INT,
    `P_ID` INT,
    `Language_ID` INT,
    PRIMARY KEY (`product_relatives_ID`)
) ENGINE=InnoDB;
ALTER TABLE `product_relatives` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `languages`;
CREATE TABLE `languages` (
    `Language_ID` INT NOT NULL AUTO_INCREMENT,
    `Language` VARCHAR(100) NOT NULL,
    `Prefix` VARCHAR(10) NOT NULL,
    PRIMARY KEY (`Language_ID`)
) ENGINE=InnoDB;
ALTER TABLE `languages` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `stuff`;
CREATE TABLE `stuff` (
    `ID` INT AUTO_INCREMENT NOT NULL,
    `Username` VARCHAR(255),
    `Password` VARCHAR(255),
    `Email` VARCHAR(255),
    `Firstname` VARCHAR(255),
    `Lastname` VARCHAR(255),
    `Avatar` TEXT,
    `AltText` VARCHAR(255),
    `PositionID` INT,
    `LanguageID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `stuff` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `rol`;
CREATE TABLE `rol` (
    `ID` INT AUTO_INCREMENT NOT NULL,
    `Rol` VARCHAR(255),
    `ActionIDs` TEXT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `rol` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `position`;
CREATE TABLE `position` (
    `ID` INT AUTO_INCREMENT NOT NULL,
    `Position` VARCHAR(255),
    `rolIDs` VARCHAR(255),
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `position` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `actions`;
CREATE TABLE `actions` (
    `ID` INT AUTO_INCREMENT NOT NULL,
    `Action` VARCHAR(255),
    `ActionDir` VARCHAR(255),
    `ActionName` VARCHAR(255),
    `ActionGroup` INT,
    `ActionType` INT,
    `Img` VARCHAR(255),
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `actions` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `buffer`;
CREATE TABLE `buffer` (
    `ID` INT NOT NULL AUTO_INCREMENT,
    `Email` VARCHAR(255),
    `Url` VARCHAR(255),
    `PositionID` INT,
    `Deadline` DATETIME,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `buffer` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `slider`;
CREATE TABLE `slider` (
    `ID` INT NOT NULL AUTO_INCREMENT,
    `ProductID` INT,
    `Order` INT,
    `Name` VARCHAR(255),
    `AltText` VARCHAR(255),
    `Type` INT, -- (1 => Product, 2 => PtoductType (subproduct) )
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `slider` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `sub_product_specification`;
CREATE TABLE `sub_product_specification` (
    `ID` INT AUTO_INCREMENT,
    `Name` VARCHAR(255),
    `User_ID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `sub_product_specification` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `sub_product_specifications`;
CREATE TABLE `sub_product_specifications` (
    `ID` INT AUTO_INCREMENT,
    `Name` VARCHAR(255),
    `spsID` INT,
    `Order` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `sub_product_specifications` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `sps_relatives`;
CREATE TABLE `sps_relatives` (
    `ID` INT AUTO_INCREMENT,
    `Ref_Key` INT,
    `User_ID` INT,
    `SPS_ID` INT,
    `Language_ID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `sps_relatives` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `spss_relatives`;
CREATE TABLE `spss_relatives` (
    `ID` INT AUTO_INCREMENT,
    `Ref_Key` INT,
    `SPSS_ID` INT,
    `User_ID` INT,
    `Language_ID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `spss_relatives` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `product_type_details`;
CREATE TABLE `product_type_details` (
    `ID` INT AUTO_INCREMENT,
    `Text` VARCHAR(255),
    `spssID` INT,
    `productTypeID` INT,
    -- `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `product_type_details` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `quantity`;
CREATE TABLE `quantity` (
    `ID` INT AUTO_INCREMENT,
    `ptRefKey` INT,
    `storeID` INT,
    `userID` INT,
    `Quantity` INT,
    `maxQuantity` INT,
    `productionDate` DATE,
    `expDate` DATE,
    `addDate` DATE,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `quantity` AUTO_INCREMENT = 1;

DROP TABLE IF EXISTS `store`;
CREATE TABLE `store` (
    `ID` INT AUTO_INCREMENT,
    `Name` VARCHAR(255),
    `Address` VARCHAR(255),
    `userID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `store` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `promo_code`;
CREATE TABLE `promo_code` (
    `ID` INT AUTO_INCREMENT,
    `Promo` VARCHAR(255),
    `affiliateID` INT,
    `expDate` DATE,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `promo_code` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `discount`;
CREATE TABLE `discount` (
    `ID` INT AUTO_INCREMENT,
    `promo_code_id` INT,
    `ptRefKey` INT,
    `discount` FLOAT,
    `discount_status` INT, -- 0 = Disabled, 1 = Enabled | if 1 promo will work even if product is at state of sale
    `revard_value` INT,
    `revard_type` INT, -- 0 is % per sold product, 1 is speciified sum per sold product 
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `discount` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `sale`;
CREATE TABLE `sale` (
    `ID` INT AUTO_INCREMENT,
    `ptID` INT,
    `sale` INT,
    `startDate` DATE,
    `expDate` DATE,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `sale` AUTO_INCREMENT = 1;


-- billing tables
DROP TABLE IF EXISTS `clients`;
CREATE TABLE `clients` (
    `ID` INT AUTO_INCREMENT,
    `Firstname` VARCHAR(255),
    `Lastname` VARCHAR(255),
    `languageID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `clients` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `purchase_history`;
CREATE TABLE `purchase_history` (
    `ID` INT AUTO_INCREMENT,
    `ptRefKey` INT,
    `quantity` INT,
    `payment_details_id` INT,
    `price` FLOAT,
    `discount` FLOAT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `purchase_history` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `payment_methods`;
CREATE TABLE `payment_methods` (
    `ID` INT AUTO_INCREMENT,
    `method` VARCHAR(255),
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `payment_methods` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `payment_details`;
CREATE TABLE `payment_details` (
    `ID` INT AUTO_INCREMENT,
    `timestamp` DATETIME,
    `TransactionID` VARCHAR(255),
    `payment_status` INT,
    `Currency` VARCHAR(255),
    `payment_method` VARCHAR(255),
    `CMD` INT, -- card masked number
    `final_price` FLOAT, -- Total paid amount of money
    `notesID` INT,
    `clientID` INT,
    `contactID` INT,
    `promo_code_id` INT,
    `promo_code` VARCHAR(255),
    `affiliateID` INT, 
    `Status` INT, -- 0 == cancelled; 1 == pending; 2 == purchased; 3 == preparing; 4 == ready for delivery; 5 == delivered (see get_order_status_list)
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `payment_details` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `partner_payments`;
CREATE TABLE `partner_payments` (
    `ID` INT AUTO_INCREMENT,
    `affiliateID` INT,
    `amount` float,
    `type` INT, -- 1 = revard, 2 = Compensation
    `timestamp` DATETIME,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `partner_payments` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `delivered`;
CREATE TABLE `delivered` (
    `ID` INT AUTO_INCREMENT,
    `timestamp` DATETIME,
    `pdID` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `delivered` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `affiliate_history`;
CREATE TABLE `affiliate_history` (
    `ID` INT AUTO_INCREMENT,
    `purchase_history_id` INT,
    `affiliateID` INT,
    `promo_code_id` INT,
    `promo_code` VARCHAR(255),
    `revard_value` INT,
    `revard_type` INT, -- 0 is % per sold product, 1 is speciified sum per sold product 
    `net` FLOAT, -- paid amount of money for current product taking into consideration discounts if applied
    `Status` INT, -- 0 == transaction cancellation; 1 == paid; 2 == panding
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `affiliate_history` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `addresses`;
CREATE TABLE `addresses` (
    `ID` INT AUTO_INCREMENT,
    `address` VARCHAR(255),
    `clientID` INT,
    `Status` INT, -- 1 == active, 0 == blacklisted
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `addresses` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `phones`;
CREATE TABLE `phones` (
    `ID` INT AUTO_INCREMENT,
    `phone` VARCHAR(255),
    `clientID` INT,
    `Status` INT, -- 1 == active, 0 == blacklisted
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `phones` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `emails`;
CREATE TABLE `emails` (
    `ID` INT AUTO_INCREMENT,
    `email` VARCHAR(255),
    `clientID` INT,
    `Status` INT, -- 1 == active, 0 == blacklisted
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `emails` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `corporate_emails`;
CREATE TABLE `corporate_emails` (
    `ID` INT AUTO_INCREMENT,
    `email` VARCHAR(255),
    `Status` INT, -- 1 == active, 0 == passive
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `corporate_emails` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `corporate_email_relatives`;
CREATE TABLE `corporate_email_relatives` (
    `ID` INT AUTO_INCREMENT,
    `ceID` INT,
    `stuffID` INT,
    `Status` INT, -- 1 == active, 0 == passive
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `corporate_email_relatives` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `subscribers`;
CREATE TABLE `subscribers` (
    `ID` INT AUTO_INCREMENT,
    `emailID` VARCHAR(255),
    `languageID` INT,
    `Status` INT, -- 1 == subscribe, 0 == unsubscribe
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `subscribers` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `notes`;
CREATE TABLE `notes` (
    `ID` INT AUTO_INCREMENT,
    `note` TEXT, 
    `type` INT, -- 1 = revard; 2 = cancelation; 3 = note; 4 = blacklisting reason; 5 = message;
    `refID` INT, -- refers to the id of the corresponding table
    `addressee_type` INT, -- 1 == stuff; 2 == client; 3 affiliate 
    `add_user_id` INT NULL,
    `Status` INT, 
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;  
ALTER TABLE `notes` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `client_messages`;
CREATE TABLE `client_messages` (
    `ID` INT AUTO_INCREMENT,
    `Message` TEXT, 
    `Initials` VARCHAR(255), 
    `Subject` VARCHAR(255), 
    `emailID` INT, 
    `languageID` INT, 
    `Date` DATE,
    `Status` INT, -- 1 == read; 0 == unread
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;  
ALTER TABLE `client_messages` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `buffer_store`;
CREATE TABLE `buffer_store` (
    `ID` INT AUTO_INCREMENT,
    `ptRefKey` INT,
    `quantityID` INT,
    `quantity` INT,
    `payment_details_id` INT,
    `promo_code_id` INT,
    `promo_code` VARCHAR(255),
    `discount` FLOAT,
    `price` FLOAT,
    `affiliateID` INT,
    `Released` TINYINT NOT NULL DEFAULT 0, -- 1 = quantity given back to stock (order cancelled)
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `buffer_store` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `client_contacts`;
CREATE TABLE `client_contacts` (
    `ID` INT AUTO_INCREMENT,
    `emailID` INT,
    `phoneID` INT,
    `addressID` INT,
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `client_contacts` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `event_clients`;
CREATE TABLE `event_clients` (
    `ID` INT AUTO_INCREMENT,
    `payment_details_id` INT, 
    `notesID` Text, 
    `clientID` INT, 
    `contactID` INT, 
    `Status` INT,
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `event_clients` AUTO_INCREMENT = 1;


DROP TABLE IF EXISTS `pd_buffer`;
CREATE TABLE `pd_buffer` (
    `ID` INT AUTO_INCREMENT,
    `pdID` INT,
    `Url` VARCHAR(255),
    PRIMARY KEY (`ID`)
) ENGINE=InnoDB;
ALTER TABLE `pd_buffer` AUTO_INCREMENT = 1;
-- End of billing tables


INSERT INTO `stuff` (`Username`, `Password`, `Email`, `Firstname`, `Lastname`, `PositionID`, `LanguageID`, `Status`)
VALUES 
    ('superuser', 'scrypt:32768:8:1$gA4uJNdnHmDVnE7E$5f5ab03f948509ea13d2807eb5f48f85b202e2d09bc99cb8476f26e1f8151b0ba3e0e5c5a85b4b351d628b0a1757c017e9e0ea52ad6802b1ebc644002024e64c', 'test@test.com', 'John', 'Smith', 6, 1, 1);
    -- password is 1234

INSERT INTO `rol` (`Rol`, `ActionIDs`, `Status`)
VALUES 
    ('Affiliate', '33,74,75,76,77,78,81', 1),
    ('Editor', '33,1,2,3,4,5,6,7,8,9,10,11,12,13,14,21,22,23,24,25,34,35,36,37,38,39,41,42,43,44,45,46,81,82,84,85,86,87', 1),
    ('Manager', '33,15,16,17,18,19,20,40,59,60,61,62,66,67,81,82,88', 1),
    ('Sales AND Marketing', '47,48,49,50,51,52,53,54,55,56,57,58,59,62,81,82,83', 1),
    ('HR', '26,27,28,29,63,69,64,65,68,70,71,72,73,81,82', 1),
    ('CEO', '33,30,31,32,79,80,81,82', 1);


-- If ActionType = 1 show on dushboard, 2 => actions with POST requests and edits  that we do not show as a botton on the dashboard.
INSERT INTO `actions` (`Action`, `ActionDir`, `ActionName`, `ActionGroup`, `ActionType`, `Img`)
VALUES     
    ('products', 'products', 'Products', 1, 1, 'fas fa-shopping-basket'),    
    ('pd', 'product/new', 'Add Product', 1, 1, 'fas fa-plus'),    
    ('add_pr', 'add_product', 'Add Product', 1, 2, 'add-product.png'),    
    ('pd', 'product/', 'Product Page', 1, 2, 'product.png'), 

    ('product_categories', 'product-categories', 'Product Categories', 2, 1, 'fas fa-layer-group'),    
    ('addPC', 'add-product-category', 'Add Product Category', 2, 1, 'fas fa-plus'),    
    ('add_p_c', 'add_product_category', 'Add Product Category', 2, 2, 'add-product-category.png'),    
    ('edit_product_category', 'edit-product-category/', 'Edit Product Category', 2, 2, 'edit-product-category.png'),    
    ('edit_p_c', 'edit_product_category', 'Edit Product Category', 2, 2, 'edit-product-category.png'),    
    
    ('pt_specifications', 'pt-specifications', 'Product Type Specifications', 3, 1, 'fas fa-flask'),  
    ('add_sps_view', 'add-sps', 'Add Product Type Specification', 3, 1, 'fas fa-plus'),  
    ('add_sps', 'add_sps', 'Add Product Type Specification', 3, 2, 'add-pt-specifications.png'),  
    ('edit_pts_view', 'edit-pts/', 'Edit Product Type Specification', 3, 2, 'edit-pt-specifications.png'),  
    ('edit_pts', 'edit-pts', 'Edit Product Type Specification', 3, 2, 'edit-pt-specifications.png'),  
    
    ('store', 'store', 'Store', 4, 1, 'fas fa-store'),    
    ('add_to_store', 'add-to-store', 'Add To Store', 4, 1, 'fas fa-plus'),    
    ('add_to_store', 'add-to-store/', 'Add To Store', 4, 2, 'add-to-store.png'),    
    ('add_to_store', 'add-to-store', 'Add To Store', 4, 2, 'add-to-store.png'),    
    ('edit_store', 'edit-store', 'Edit Store', 4, 2, 'edit-store.png'),  
    ('edit_store', 'edit-store/', 'Edit Store', 4, 2, 'edit-store.png'),  

    ('edit_pr_headers', 'edit_product_headers', 'Edit Product Headers', 5, 3, 'edit-product-headers.png'),    
    ('submit_r_t', 'submit_reach_text', 'Product Content', 5, 3, 'product-content.png'),    
    ('pr_thumbnail', 'pr-thumbnail/', 'Thumbnail', 5, 3, 'thumbnail.png'),  
    ('edit_pr_thumbnail', 'edit_pr_thumbnail', 'Edit Thumbnail', 5, 3, 'edit_thumbnail.png'),  
    ('publishP', 'publish-product', 'Publish Product', 5, 3, 'publish-product.png'),

    ('team', 'team', 'Team', 6, 1, 'fas fa-people-group'),
    ('add_teammate', 'add-teammate', 'Add teammate', 6, 1, 'fas fa-user-plus'),
    ('teampage', 'team/', 'Team', 6, 2, ''),
    ('edit_teammate', 'edit-teammate/', 'Edit Teammate', 6, 2, ''),

    ('roles', 'roles', 'Roles', 7, 1, 'fas fa-user-tie'),  
    ('add_role', 'add-role', 'Add Role', 7, 1, 'fas fa-plus'),
    ('edit_role', 'edit-role/', 'Edit Role', 7, 2, 'add-role.png'), 

    ('stuff', 'stuff', 'Stuff', 8, 2, 'stuff.png'), 

    ('change_pr_order', 'changeprorder', 'Change Product Order', 9, 2, 'changeprorder.png'), 
    ('add_price', 'add-price/', 'Add Price', 9, 2, 'changeprorder.png'), 
    ('add_price', 'add-price/', 'Add Price', 9, 2, 'changeprorder.png'), 
    ('upload_slides', 'upload_slides', 'Add Price, Upload Slides', 9, 2, 'upload-slides.png'), 
    ('edit_price', 'edit-price/', 'Edit Price', 9, 2, 'editprice.png'), 
    ('editprice', 'editprice', 'Edit Price', 9, 2, 'editprice.png'), 
    ('get_product_types_quantity', 'get-product-types-quantity', 'Get Product Types Quantity', 9, 2, 'get_product_types_quantity.png'), 
    ('get_specifications', 'get-spacifications', 'Get Spacifications', 9, 2, 'get-spacifications.png'), 
    ('get_product_types', 'get-product-types', 'Get Product Types', 9, 2, 'get-product-types.png'), 
    ('change_type_order', 'change-type-order', 'Get Type Order', 9, 2, 'change-type-order.png'), 
    ('chaneg_pt_status', 'chaneg-pt-status', 'Change Product Type Status', 9, 2, 'change-type-order.png'), 
    ('submit_product_t', 'submit_product_text', 'Submit Product Text', 9, 2, 'change-type-order.png'), 
    ('get_slides', 'get_slides', 'Get Slides', 9, 2, 'get_slides.png'),

    ('promo_codes', 'promo-codes', 'Promo Codes', 10, 1, 'fas fa-tag'),
    ('create_promo_code', 'create-promo-code', 'Create Promo Code', 10, 1, 'fas fa-plus'), -- G/P
    ('edit_promo_code', 'edit-promo-code/', 'Edit Promo Code', 10, 2, 'edit_promo_code.png'), 
    ('stuff_promo_code_details', 'stuff-promo-code-details/', 'Promo Code Details', 10, 2, 'stuff_promo_code_details.png'), 
    ('edit_promo', 'edit-promo', 'Edit Promo', 10, 2, 'edit_promo.png'), 

    ('orders', 'orders/page=1&status=all', 'Orders', 11, 1, 'fas fa-clipboard-list'), 
    ('order_details', 'order-details/', 'Order Details', 11, 2, ''), 
    ('get_order_details', 'get-order-details', 'Get Order Details', 11, 2, ''), 
    ('edit_order_details', 'edit-order-details', 'Edit Order Details', 11, 2, ''), 
    
    ('affiliates', 'affiliates', 'Affiliates', 12, 1, 'fas fa-people-arrows'), 
    ('affiliate', 'affiliate/', 'Affiliate', 12, 2, 'affiliate.png'), 
    ('stuff_affiliate_orders', 'stuff-affiliate-orders/', 'Affiliate Orders', 12, 2, 'stuff_affiliate_orders.png'), 
   
    ('transfers', 'transfers/page=1', 'Transfers', 13, 1, 'fas fa-coins'), 
    ('transfer_funds', 'transfer-funds', 'Transfer Funds', 13, 1, 'fas fa-hand-holding-dollar'), -- G/P
    ('transfer_funds', 'transfer-funds/', 'Transfer Funds', 13, 2, 'transfer-funds.png'), -- G/P
    ('get_transfer_details', 'get-transfer-details', 'Get Transfer Details', 13, 2, ''),
    
    ('emails', 'emails/page=1', 'Mailbox', 14, 1, 'fas fa-envelopes-bulk'),
    ('create_email', 'create-email', 'Create Email', 14, 1, 'fas fa-envelope-circle-check'), -- G/P
    ('assign_email', 'assign-email', 'Assign Email', 14, 1, 'fas fa-at'), -- G/P
    ('send_email', 'send-email', 'Send Email', 14, 1, 'fas fa-paper-plane'), -- G/P
    ('send_email', 'send-email/', 'Send Email', 14, 2, 'send_email.png'), -- G/P
    ('corporate_emails', 'corporate-emails/page=1', 'Corporate Emails', 14, 1, 'fas fa-envelope-open-text'),
    ('get_email_content', 'get-email-content', 'Get Email Content', 14, 2, ''),
    ('get_associated_employees', 'get-associated-employees', 'Get Associated Employees', 14, 2, ''),
    ('rm_email_em', 'remove-email-from-employee', 'Remove Email From Employee', 14, 2, ''),
    ('edit_ce_view', 'edit-corporate-email-view', 'Edit Corporate Email View', 14, 2, ''),
    ('edit_ce', 'edit-corporate-email', 'Edit Corporate Email', 14, 2, ''),
    
    ('affiliate_orders', 'affiliate-orders/page=1&status=all', 'Affiliate Orders', 15, 1, 'fas fa-clipboard-list'),
    ('affiliate_order_details', 'affiliate-order-details/', 'Affiliate Order Details', 15, 2, 'affiliate_order_details.png'),
    ('affiliate_transfers', 'affiliate-transfers/page=1', 'Affiliate Transfers', 15, 1, 'fas fa-coins'),
    ('promo_code_details', 'promo-code-details/', 'Promo Code Details', 15, 2, 'promo_code_details.png'),
    ('get_affiliate_transfer_details', 'get-affiliate-transfer-details', 'Get Affiliate Transfer Details', 15, 2, ''),

    ('positions', 'positions', 'Positions', 16, 1, 'fas fa-chair'),
    ('edit_position', 'edit-position/', 'Edit Positions', 16, 2, ''),

    ('edit_profile', 'edit-profile/', 'Edit Profile', 17, 2, ''),

    ('setroll', 'setroll/', 'Set role', 18, 2, ''),

    ('get_chart_data', 'get-chart-data', 'Get chart data', 19, 2, ''),

    ('slides', 'slides', 'Slides', 0, 1, 'fas fa-sliders-h'),    
    ('add_slide', 'add-slide', 'Add Slide', 0, 1, 'fas fa-plus'),    
    ('add_slide_post', 'add_slide', 'Add Slide', 0, 2, 'fas fa-shopping-basket'),    
    ('edit_slide', 'edit-slide/', 'Edit Slide', 0, 2, 'fas fa-plus'),    
    ('ticket', 'ticket/', 'Ticket', 0, 2, 'fas fa-ticket')
    ;

    INSERT INTO `position` (`Position`, `rolIDs`, `Status`)
    VALUES 
    ('Affiliate', '1', 1),
    ('Editor', '2,1', 1),
    ('Manager', '3,2,1', 1),
    ('Sales AND Marketing', '4,3,2,1', 1),
    ('HR', '5,4,3,2,1', 1),
    ('CEO', '6,5,4,3,2,1', 1);

INSERT INTO `store` (`Name`, `Address`, `userID`, `Status`) Values('Գլխամասային', '', 1, 1);

INSERT INTO `sub_product_specification` (`Name`, `User_ID`, `Status`) 
    VALUES ('Միջոցառում', 0, 1),
           ('Events', 0, 1);
INSERT INTO `sps_relatives` (`SPS_ID`, `Ref_Key`, `Language_ID`, `User_ID`, `Status`) 
    VALUES  (1, 0, 1, 0, 1), 
            (2, 0, 2, 0, 1);

INSERT INTO `sub_product_specifications` (`Name`, `Order`, `spsID`, `Status`) 
    VALUES ('Ամսաթիվ', 0, 1, 1),
           ('Հասցե', 1, 1, 1),
           ('Date', 0, 2, 1),
           ('Address', 1, 2, 1);
INSERT INTO `spss_relatives` (`SPSS_ID`, `Ref_Key`, `Language_ID`, `User_ID`, `Status`) 
    VALUES  (1, 0, 1, 0, 1), 
            (3, 0, 2, 0, 1),
            (2, 1, 1, 0, 1),
            (4, 1, 2, 0, 1);


INSERT INTO `product_category` (`Product_Category_Name`, `User_ID`, `Product_Category_Status`, `spsID`, `xRatio`, `yRatio`) 
    VALUES  
        ('Միջոցառումներ', 0, 1, 1, 16, 9),
        ('Նախաձեռնություններ', 0, 1, 1, 4, 3),
        ('Events', 0, 1, 2, 16, 9),
        ('Activities', 0, 1, 2, 4, 3);


INSERT INTO `product_c_relatives` (`PC_Ref_Key`, `PC_ID`, `Language_ID`, `User_ID`) 
    VALUES (0, 1, 1, 0), (0, 3, 2, 0), (1, 2, 1, 0), (1, 4, 2, 0);

INSERT INTO `languages` (`Language`, `Prefix`) VALUES
('Հայերեն', 'hy'),
('English', 'en'),
('中文 (普通话)', 'zh'),
('Español', 'es'),
('हिन्दी', 'hi'),
('বাংলা', 'bn'),
('Português', 'pt'),
('Русский', 'ru')
;

INSERT INTO `payment_methods` (`method`, `Status`) VALUES
('Credit/Debit card', 1),
('Idram', 1),
('TellCell', 1),
('Cash', 1),
('Apple Pay',1),
('Google Pay', 1);
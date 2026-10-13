from PIL import Image, ImageDraw, ImageFont
import os
import sys
import math

def draw_rounded_rect(draw, xy, radius=18, outline=(210, 210, 210), width=2, fill=(255, 255, 255)):
    """Helper function to draw rounded rectangle"""
    draw.rounded_rectangle(xy, radius, outline=outline, width=width, fill=fill)

def load_font(size, bold=False):
    """Load font with multiple fallback options and better error handling"""
    
    # List of font paths to try
    font_paths = [
        # Windows fonts
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/Arial.ttf",
        "C:/Windows/Fonts/ArialBold.ttf" if bold else "C:/Windows/Fonts/Arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
        
        # Mac fonts
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Avenir.ttc",
        
        # Linux fonts
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        
        # Generic names
        "arial.ttf",
        "Arial.ttf",
        "helvetica.ttf",
        "DejaVuSans.ttf",
    ]
    
    # Try each font path
    for font_path in font_paths:
        try:
            font = ImageFont.truetype(font_path, size)
            font.font_path = font_path  # Store the path for tracking
            return font
        except:
            continue
    
    # If no TrueType fonts work, use default
    try:
        default = ImageFont.load_default()
        default.font_path = "default"
        if size > 20:
            return default
    except:
        default = ImageFont.load_default()
        default.font_path = "default"
        return default

# ========================================
# FONT SIZE CONFIGURATION
# ========================================

F_LABEL = load_font(26)           # Labels
F_TEXT = load_font(28)            # Regular text values  
F_BOLD = load_font(30, bold=True) # Bold text
F_TITLE = load_font(34, bold=True)# Title text
F_CAP = load_font(28)             # Caption under QR
F_URL = load_font(24)             # URL text


# Get base directory
basedir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()

# ========================================
# CALCULATE DYNAMIC CANVAS HEIGHT
# ========================================

# Fixed width
W = 900
pad = 36


# ========================================
# ORDER DETAILS
# ========================================
details = [
    ("Event:", "Demo Ski!"),
    ("Date:", "06/04/2018 11:15:08"),
    ("Amount:", "260.00 SEK"),
    ("Status:", "Completed"),
]


# Card 1 dimensions
card1_top = 60
header_height = 130  # Logo, company name, separator
num_rows_card1 = len(details)  # Event, Date, Amount, Status
line_height = 80
card1_content_padding = 30
card1_height = header_height + (num_rows_card1 * line_height) + card1_content_padding
card1_bottom = card1_top + card1_height

# Space between cards
space_between = 40

# Card 2 dimensions
card2_top = card1_bottom + space_between
qr_size = 260
qr_padding_top = 35
qr_padding_bottom = 20
caption_space = 30
url_space = 60
card2_padding_bottom = 30
card2_height = qr_padding_top + qr_size + qr_padding_bottom + caption_space + url_space + card2_padding_bottom
card2_bottom = card2_top + card2_height

# Total canvas height
bottom_margin = 50
H = card2_bottom + bottom_margin

# print(f"Canvas dimensions: {W}x{H}")
# print(f"Card 1: y={card1_top} to {card1_bottom} (height={card1_height})")
# print(f"Card 2: y={card2_top} to {card2_bottom} (height={card2_height})")
# print("="*60 + "\n")

# ========================================
# CREATE CANVAS
# ========================================
img = Image.new("RGB", (W, H), (255, 255, 255))
draw = ImageDraw.Draw(img)

# ========================================
# CARD 1: ORDER DETAILS
# ========================================
card1_coords = (pad, card1_top, W - pad, card1_bottom)
draw_rounded_rect(draw, card1_coords, radius=20, outline=(180, 180, 180), width=3, fill=(255, 255, 255))

# Draw separator line
sep_y = card1_top + 130
draw.line((card1_coords[0] + 20, sep_y, card1_coords[2] - 20, sep_y), 
          fill=(220, 220, 220), width=3)

# Column positions
label_x = card1_coords[0] + 40
value_x = label_x + 200

# ========================================
# LOGO AND COMPANY NAME HEADER
# ========================================
y_pos = card1_top + 20
logo_size = 80  # Height of logo

# Try to load the actual logo
logo_loaded = False
logo_y = y_pos + 10
try:
    logo_path = os.path.join(basedir, 'static', 'images', 'logo.png')
    logo = Image.open(logo_path)
    
    # Resize logo while maintaining aspect ratio
    logo_aspect = logo.width / logo.height
    logo = logo.resize((int(logo_size * logo_aspect), logo_size), Image.Resampling.LANCZOS)
    
    # Position and paste logo
    logo_x = card1_coords[0] + 40
    
    # Handle transparency if present
    if logo.mode in ('RGBA', 'LA'):
        img.paste(logo, (logo_x, logo_y), logo)
    else:
        img.paste(logo, (logo_x, logo_y))
    
    logo_loaded = True
    logo_width = logo.width
    
except Exception as e:
    print(f"⚠ Could not load logo: {e}")
    logo_x = card1_coords[0] + 40
    logo_width = 80
    
    # Draw spiral logo placeholder
    center_x = logo_x + 40
    center_y = logo_y + 40
    
    # Draw spiral pattern
    for i in range(12):
        angle = i * 30
        start_angle = angle - 15
        end_angle = angle + 15
        radius_end = 38
        
        arc_box = (center_x - radius_end, center_y - radius_end,
                   center_x + radius_end, center_y + radius_end)
        draw.arc(arc_box, start=start_angle, end=end_angle, 
                fill=(20, 20, 20), width=3)
    
    # Center circle
    draw.ellipse((center_x - 15, center_y - 15, 
                  center_x + 15, center_y + 15), 
                 fill=(255, 255, 255), outline=(20, 20, 20), width=2)

# Draw Company Name - ARAXI TRAVEL (CENTERED AND ALIGNED)
company_name = "ARAXI TRAVEL"
company_font = load_font(60, bold=True)

# Calculate text width to center it horizontally
company_bbox = draw.textbbox((0, 0), company_name, font=company_font)
text_width = company_bbox[2] - company_bbox[0]

# Center horizontally on the canvas
company_x = (W - text_width) // 2

# Align vertically with logo
company_y = logo_y  # Same baseline as logo

# Draw company name
draw.text((company_x, company_y), company_name, font=company_font, fill=(20, 20, 20))


y_pos = sep_y + 45
line_height = 80

for label, value in details:
    # Draw label
    draw.text((label_x, y_pos), label, font=F_LABEL, fill=(80, 80, 80))
    
    # Draw value with appropriate styling
    if label == "Status:":
        draw.text((value_x, y_pos), value, font=F_BOLD, fill=(0, 150, 0))
    elif label == "Amount:":
        draw.text((value_x, y_pos), value, font=F_BOLD, fill=(10, 10, 10))
    else:
        draw.text((value_x, y_pos), value, font=F_TEXT, fill=(40, 40, 40))
    
    y_pos += line_height

# ========================================
# CARD 2: QR CODE
# ========================================
card2_coords = (pad, card2_top, W - pad, card2_bottom)
draw_rounded_rect(draw, card2_coords, radius=20, outline=(180, 180, 180), width=3, fill=(255, 255, 255))

# QR Code settings
qr_url = "https://www.araxitravel.am/ticket/35-T75JIZV"  # Full URL for QR
footer_text = "www.araxitravel.am"  # Display text below QR

# Generate QR Code
qr_generated = False
try:
    import qrcode
    
    qr = qrcode.QRCode(
        version=1,  
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=3,
    )
    qr.add_data(qr_url)
    qr.make(fit=True)
    
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_img = qr_img.convert("RGB")
    
    if qr_img.size[0] != qr_size:
        qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.NEAREST)
    
    qr_generated = True
    
except ImportError:
    
    # Create placeholder QR pattern
    qr_img = Image.new("RGB", (qr_size, qr_size), "white")
    qr_draw = ImageDraw.Draw(qr_img)
    
    block = qr_size // 21
    
    # Finder patterns
    def draw_finder(x, y):
        qr_draw.rectangle((x, y, x + 7*block, y + 7*block), fill="black")
        qr_draw.rectangle((x + block, y + block, x + 6*block, y + 6*block), fill="white")
        qr_draw.rectangle((x + 2*block, y + 2*block, x + 5*block, y + 5*block), fill="black")
    
    draw_finder(0, 0)
    draw_finder((21-7)*block, 0)
    draw_finder(0, (21-7)*block)
    
    # Timing patterns
    for i in range(8, 13):
        if i % 2 == 0:
            qr_draw.rectangle((i*block, 6*block, (i+1)*block, 7*block), fill="black")
            qr_draw.rectangle((6*block, i*block, 7*block, (i+1)*block), fill="black")
    
    # Data pattern
    import random
    random.seed(42)
    for x in range(8, 13):
        for y in range(8, 13):
            if random.random() > 0.5:
                qr_draw.rectangle((x*block, y*block, (x+1)*block, (y+1)*block), fill="black")

# Center and paste QR code
qr_x = (W - qr_size) // 2
qr_y = card2_top + qr_padding_top
img.paste(qr_img, (qr_x, qr_y))

# Caption below QR
caption = "Scan this code to enter!"
caption_bbox = draw.textbbox((0, 0), caption, font=F_CAP)
caption_x = (W - (caption_bbox[2] - caption_bbox[0])) // 2
caption_y = qr_y + qr_size + qr_padding_bottom
draw.text((caption_x, caption_y), caption, font=F_CAP, fill=(50, 50, 50))

# URL below caption - properly centered
url_bbox = draw.textbbox((0, 0), footer_text, font=F_URL)
url_width = url_bbox[2] - url_bbox[0]
url_x = (W - url_width) // 2
url_y = caption_y + 60
draw.text((url_x, url_y), footer_text, font=F_URL, fill=(100, 100, 100))

# ========================================
# SAVE OUTPUT FILES
# ========================================
output_dir = os.path.join(basedir, 'static', 'images', 'qr_tickets')
os.makedirs(output_dir, exist_ok=True)

# Save files
filename_jpg = "ticket_enhanced.jpg"
filename_png = "ticket_enhanced.png"

jpg_path = os.path.join(output_dir, filename_jpg)
png_path = os.path.join(output_dir, filename_png)

img.save(jpg_path, "JPEG", quality=98)
img.save(png_path, "PNG")

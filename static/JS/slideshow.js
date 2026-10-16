    // ---- Photo gallery (templates/slideshow.html, static/css/product-gallery.css): one photo at a
    // time on the stage, a strip of thumbnails under it and a full-screen viewer. The price
    // thumbnails open a photo by its position (showImage), so these names stay as they were
    const gallery = document.querySelector('[data-gallery]');
    const galleryStage = gallery ? gallery.querySelector('[data-gallery-stage]') : null;
    const gallerySlides = gallery ? Array.from(gallery.querySelectorAll('.pg__slide')) : [];
    const galleryThumbs = gallery ? Array.from(gallery.querySelectorAll('.pg__thumb')) : [];
    const galleryStrip = gallery ? gallery.querySelector('[data-gallery-thumbs]') : null;
    const lightbox = gallery ? gallery.querySelector('[data-gallery-lightbox]') : null;
    const lightboxImg = lightbox ? lightbox.querySelector('[data-gallery-lightbox-img]') : null;
    const galleryCounters = gallery ? Array.from(gallery.querySelectorAll('[data-gallery-counter]')) : [];
    let currentImageIndex = 0;

    const pad2 = n => String(n).padStart(2, '0');

    // Scrolls only the strip, sideways, so the thumbnail is in view (scrollIntoView would also
    // scroll the page)
    function revealThumbnail(thumb) {
        if (!galleryStrip || !thumb) {
            return;
        }
        const left = thumb.offsetLeft - galleryStrip.offsetLeft;
        const right = left + thumb.offsetWidth;
        if (left < galleryStrip.scrollLeft) {
            galleryStrip.scrollTo({ left: left - 2, behavior: 'smooth' });
        } else if (right > galleryStrip.scrollLeft + galleryStrip.clientWidth) {
            galleryStrip.scrollTo({ left: right - galleryStrip.clientWidth + 2, behavior: 'smooth' });
        }
    }

    function showImage(num) {
        if (!gallerySlides.length) {
            return;
        }
        const count = gallerySlides.length;
        num = Number(num) || 0;
        currentImageIndex = ((num % count) + count) % count;

        gallerySlides.forEach((slide, i) => {
            const active = i === currentImageIndex;
            slide.classList.toggle('is-active', active);
            if (active) slide.removeAttribute('aria-hidden'); else slide.setAttribute('aria-hidden', 'true');
        });
        galleryThumbs.forEach((thumb, i) => {
            const active = i === currentImageIndex;
            thumb.classList.toggle('is-active', active);
            if (active) thumb.setAttribute('aria-current', 'true'); else thumb.removeAttribute('aria-current');
        });
        revealThumbnail(galleryThumbs[currentImageIndex]);

        const text = pad2(currentImageIndex + 1) + ' / ' + pad2(count);
        galleryCounters.forEach(counter => { counter.textContent = text; });

        if (lightboxImg) {
            const img = gallerySlides[currentImageIndex].querySelector('img');
            lightboxImg.src = img.getAttribute('src');
            lightboxImg.alt = img.alt;
        }
    }

    function nextImage() {
        showImage(currentImageIndex + 1);
    }

    function prevImage() {
        showImage(currentImageIndex - 1);
    }

    // The thumbnails now sit in a strip that showImage keeps in view: kept for the price thumbnails'
    // and older pages' calls
    function scrollThumbnailsFromPrice(num) {
        revealThumbnail(galleryThumbs[Number(num) || 0]);
    }

    function scrollThumbnails(direction) {
        if (galleryStrip) {
            const step = galleryStrip.clientWidth * (direction === 'left' ? -1 : 1);
            galleryStrip.scrollBy({ left: step, behavior: 'smooth' });
        }
    }

    // Full-screen viewer. It's moved to the end of the page, so nothing around the gallery
    // (a hidden block, a stacking context) can hide or clip it
    let lightboxOpener = null;

    function openLightbox() {
        if (!lightbox) {
            return;
        }
        if (lightbox.parentNode !== document.body) {
            document.body.appendChild(lightbox);
        }
        lightboxOpener = document.activeElement;
        lightbox.classList.add('is-open');
        document.documentElement.classList.add('pg-locked');
        lightbox.querySelector('[data-gallery-close]').focus({ preventScroll: true });
    }

    function closeLightbox() {
        if (!lightbox || !lightbox.classList.contains('is-open')) {
            return;
        }
        lightbox.classList.remove('is-open');
        document.documentElement.classList.remove('pg-locked');
        if (lightboxOpener && lightboxOpener.focus) {
            lightboxOpener.focus({ preventScroll: true });
        }
    }

    if (gallery) {
        gallery.querySelector('[data-gallery-open]').addEventListener('click', openLightbox);
        lightbox.querySelector('[data-gallery-close]').addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
        galleryStage.addEventListener('dblclick', e => { if (!e.target.closest('button')) openLightbox(); });

        // Arrow keys while the stage (or a button on it) has focus, or in the viewer; Escape closes it
        document.addEventListener('keydown', e => {
            const inLightbox = lightbox.classList.contains('is-open');
            if (!inLightbox && !galleryStage.contains(document.activeElement)) {
                return;
            }
            if (e.key === 'ArrowLeft') { prevImage(); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { nextImage(); e.preventDefault(); }
            else if (e.key === 'Escape' && inLightbox) { closeLightbox(); e.preventDefault(); }
        });

        // Swipe on the stage and in the viewer
        [galleryStage, lightbox].forEach(area => {
            let startX = null, startY = null;
            area.addEventListener('pointerdown', e => { startX = e.clientX; startY = e.clientY; });
            area.addEventListener('pointercancel', () => { startX = null; });
            area.addEventListener('pointerup', e => {
                if (startX === null) return;
                const dx = e.clientX - startX, dy = e.clientY - startY;
                startX = null;
                if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) && gallerySlides.length > 1) {
                    if (dx < 0) nextImage(); else prevImage();
                }
            });
        });
    }

    // Price thumbnails
    
    // let currentImageIndexP = 0;
    const thumbnailsP = document.querySelectorAll('.price-thumbnails img');
    const imagesP = [];
    const imagesSRCPrice = [];

    thumbnailsP.forEach(thumbnail => {
        const src = thumbnail.getAttribute('src');
        const imageName = src.split('/').pop();
        imagesSRCPrice.push(src);
        imagesP.push(imageName);
    });


    // if (imagesP.length < 5) {
        //     document.querySelector('.thumbnails-wrapper').style.width = '100%';
        // }
        // let returnChecker = false; // Maybe I delete you
        // let scrollPosition = 0; // Maybe I delete you
        
        let maxShownThumbnailsP = 5;
            if (screen.width < 475) {
                maxShownThumbnailsP = 3;
            } else {
                maxShownThumbnailsP = 5;
            }
            
        let scrollCounterP = 1
    
        let scrollNumberP = Math.floor(imagesP.length / maxShownThumbnailsP) +  (imagesP.length % maxShownThumbnailsP === 0 ? 0 : 1);
        
        let thumbnailImageP = document.querySelector('.price-thumbnails img');
        let imgWidthP = thumbnailImageP ? thumbnailImageP.offsetWidth : 0;
        let imgStyleP;
        let marginRightP;
        if (thumbnailImageP) {
            imgStyleP = window.getComputedStyle(thumbnailImageP);
            marginRightP = imgStyleP.marginRight;
            marginRightP = parseInt(marginRightP.replace("px", ""), 10);
        }

        let itemWidthP = imgWidthP + marginRightP;
        let scrollToP = 0;
        
        const thumbnailContainerP = document.querySelector('.price-thumbnails');
        

    function displaySize() {
        // Price thumbnails: how many the strip shows, and their size
        if (screen.width < 475) {
            maxShownThumbnailsP = 3;
        } else {
            maxShownThumbnailsP = 5;
        }

        scrollNumberP = Math.floor(imagesP.length / maxShownThumbnailsP) +  (imagesP.length % maxShownThumbnailsP === 0 ? 0 : 1);
        imgWidthP = thumbnailImageP ? thumbnailImageP.offsetWidth : 0;
        if (thumbnailImageP) {
            imgStyleP = window.getComputedStyle(thumbnailImageP);
            marginRightP = imgStyleP.marginRight;
            marginRightP = parseInt(marginRightP.replace("px", ""), 10);
        }

        itemWidthP = imgWidthP + marginRightP;
     
      }

      // Initial size display
    //   displaySize();

      // Event listener for resize events
      window.addEventListener('resize', displaySize);


    //Price thumbnails 
    function scrollThumbnailsPrice(direction, stop) {

        if (screen.width < 475) {
            maxShownThumbnailsP = 3;
        } else {
            maxShownThumbnailsP = 5;
        }

        const imagesP = [];
        const imagesSRCPrice = [];

        thumbnailsP.forEach(thumbnail => {
            const src = thumbnail.getAttribute('src');
            const imageName = src.split('/').pop();
            imagesSRCPrice.push(src);
            imagesP.push(imageName);
        });
        
        let thumbnailImageP = document.querySelector('.price-thumbnails img');
        let imgWidthP = thumbnailImageP ? thumbnailImageP.offsetWidth : 0;
        let imgStyleP;
        let marginRightP;
        if (thumbnailImageP) {
            imgStyleP = window.getComputedStyle(thumbnailImageP);
            marginRightP = imgStyleP.marginRight;
            marginRightP = parseInt(marginRightP.replace("px", ""), 10);
        }

        let itemWidthP = imgWidthP + marginRightP;

        let thumbnailsWrapperWidthP = document.querySelector('.price-thumbnails-wrapper').offsetWidth;
        // Scroll to the left
        if (direction === 'left') {
                scrollCounterP = scrollCounterP - 1;
                if (scrollCounterP === 0) {
                    scrollCounterP = scrollNumberP;
                } 
                if (scrollCounterP === scrollNumberP) {

                    if (imagesP.length % maxShownThumbnailsP > 0) { // if num of last image group is less then maxShownThumbnailsP
                        scrollToP = thumbnailsWrapperWidthP * (scrollCounterP - 2) + itemWidthP * (imagesP.length % maxShownThumbnailsP); // + marginRightP * (scrollCounterP - 1);
                    } else {
                        scrollToP = thumbnailsWrapperWidthP * (scrollCounterP - 1);
                    }
                } else {
                    scrollToP = thumbnailsWrapperWidthP * (scrollCounterP - 1);
                }



        } else {
            // Scroll to Right
                if (scrollCounterP === scrollNumberP) {
                    scrollCounterP = 1;
                    scrollToP = 0;       
                } else if (scrollCounterP === scrollNumberP - 1) { 
                    if (imagesP.length % maxShownThumbnailsP > 0) { // if num of last image group is less then maxShownThumbnailsP
                        scrollToP = thumbnailsWrapperWidthP * (scrollCounterP - 1) + itemWidthP * (imagesP.length % maxShownThumbnailsP); // + marginRightP * (scrollCounterP - 1);
                    } else {
                        scrollToP = thumbnailsWrapperWidthP * scrollCounterP; // + marginRightP * (scrollCounterP - 1);
                    }
                    scrollCounterP = scrollCounterP + 1;
                        
                } else {
                    scrollToP = thumbnailsWrapperWidthP * scrollCounterP; // + marginRightP * (scrollCounterP - 2);
                    scrollCounterP = scrollCounterP + 1;
                }
        }

        
        thumbnailContainerP.style.transform = `translateX(-${scrollToP}px)`; // Adjust based on thumbnail size and gap
    }



    function changeType(typeID, imgElement) {
        let spss = document.querySelectorAll('.productType');
        if (spss) {
            spss.forEach(function(span) {
                span.style.display = 'none';
            });
            document.getElementById('type_' + typeID).style.display = 'block';
        }

        document.querySelectorAll('.price-thumbnails img').forEach(img => {
            img.classList.remove('selectedThumbnail');
        });

        imgElement.classList.add('selectedThumbnail');
        updatePriceTitle();
    }

    // The price section's heading (slideshow.html, data-price-title) shows the title of the price on show,
    // with that price's Edit Price / Add To Store links for staff
    function updatePriceTitle() {
        const heading = document.querySelector('[data-price-title]');
        const shown = [...document.querySelectorAll('.productType')].find(block => block.style.display !== 'none');
        const title = shown && shown.querySelector('.subproduct');
        if (!heading || !title) {
            return;
        }
        heading.textContent = title.textContent.trim();
        heading.setAttribute('data-bs-content', title.getAttribute('data-bs-content') || '');
    }

document.addEventListener("DOMContentLoaded", function() {
    
    const quantities = document.querySelectorAll(`.quantity`);
    const hiddenPt = document.getElementById('hiddenPtID');
    
    if (hiddenPt) {
        const hiddenPtID = document.getElementById('hiddenPtID').value;
        // scrollThumbnailsFromPrice(1);
        if (document.querySelectorAll('.add-to-cart-btn')) {
            let btns = document.querySelectorAll('.add-to-cart-btn');
            let i = 0;
            let flag = 0;
            let imgs = document.querySelectorAll('.price-thumbnails img');
            let productTypeBlocks = document.querySelectorAll('.productType');

            btns.forEach(btn => {
                if (btn.value === hiddenPtID) {
                    flag = i;
                    imgs.forEach(img => {
                        img.classList.remove('selectedThumbnail');
                    });

                    productTypeBlocks.forEach(block => {
                        block.style.display = 'none';
                    });
                }
                i += 1;
            });

            const imgElement = document.querySelector(`img[data-ptid="${hiddenPtID}"]`);

            let dataValue = 0;
            if (imgElement) {
                // dataValue = imgElement.getAttribute('data-value');
                dataValue = parseInt(imgElement.getAttribute('data-value'));
            } 

            if (imgs[flag]) {
                imgs[flag].classList.add('selectedThumbnail');
            }
            if (productTypeBlocks[flag]) {
                productTypeBlocks[flag].style.display = 'block';
            }

            scrollThumbnailsFromPrice(dataValue);
            showImage(dataValue);
        }
    }

    updatePriceTitle();

    function get_max_prch_qty(ptID, callback) {

        let formData = new FormData();
        
        // Create a new FormData object
        formData.append('ptID', ptID);
        formData.append('quantity', 1);
        
        // Create a new XMLHttpRequest object
        let xhr = new XMLHttpRequest();
        let data = [];
        
        // Configure the request
        xhr.open('POST', '/get-pt-quantity');
        xhr.setRequestHeader('X-CSRFToken', csrfToken);
        
        // Define what happens on successful data submission
        xhr.onload = function () {
            if (xhr.status === 200) {
                let response = JSON.parse(xhr.responseText);
                
                if (response.status === 1) {
                    // Handle empty product name
                    callback(response.data);                  
                } 
            } else {
                // Handle error response
                console.error('Error adding category:', xhr.responseText);
            }

        };
        
        // Send the request with the FormData object
        xhr.send(formData);
    }
    
    const ptIDs = document.querySelectorAll('.buy-btn');

    ptIDs.forEach(ptID => {
        get_max_prch_qty(ptID.value, function(maxPrchQty) {
            console.log(maxPrchQty);

            select = document.getElementById('select-quantity-'+ptID.value)
            if (maxPrchQty.length > 0) {
                if (maxPrchQty.data[0].quantity > 0) {

                    
                    num = maxPrchQty.data[0].maxQuantity;
                    if (num == null) {
                        num = maxPrchQty.data[0].quantity;
                    }
                    if (maxPrchQty.data[0].maxQuantity > maxPrchQty.data[0].quantity) {
                        num = maxPrchQty.data[0].quantity;
                    }
                    
                    for (let i = 1; i <= num; i++) {
                        let option = document.createElement("option");
                        option.value = i;
                        option.text = i;
                        select.appendChild(option);
                    }
                } else {
                    const cardContainer = select.parentNode
                    cardContainer.innerHTML = document.getElementById('no-spot-left').value;
                }
            } else {
                const cardContainer = select.parentNode
                cardContainer.innerHTML = document.getElementById('no-spot-left').value;
            }
            
        });
    });
        
    quantities.forEach(quantity => {
        quantity.addEventListener('change', function(e) {
            let selectParentNode = this.parentNode;
            // cards with booking choices (vehicle, guide, age groups) show their price with booking.js
            if (selectParentNode.parentNode.querySelector('[data-booking]') && document.getElementById('bookingData')) {
                return;
            }
            let ptID = selectParentNode.querySelector('.buy-btn').value;
            let selectedOption = this.value;
            get_max_prch_qty(ptID, function(maxPrchQty) {
                newPrice = parseFloat(maxPrchQty.data[0].Price) * parseFloat(selectedOption)
                
                let priceContainer = selectParentNode.parentNode.querySelector('.price');
                if (newPrice !== 0) {
                    priceContainer.innerHTML = newPrice.toString() + '.0 ' + priceContainer.textContent.split(' ')[1]
                }
            });
        });
    });

});
      
      
      
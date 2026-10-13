    let currentImageIndex = 0;
    const thumbnails = document.querySelectorAll('.thumbnails img');
    const images = [];
    const imagesSRC = [];

    thumbnails.forEach(thumbnail => {
        const src = thumbnail.getAttribute('src');
        const imageName = src.split('/').pop();
        imagesSRC.push(src);
        images.push(imageName);
    });

    let maxShownThumbnails = 5;

    if (images.length < 5) {
        document.querySelector('.thumbnails-wrapper').style.width = '100%';
        maxShownThumbnails = images.length;
    }
    let returnChecker = false;
    let scrollPosition = 0;
    let scrollCounter = 1
    let scrollNumber = Math.floor(images.length / maxShownThumbnails) +  (images.length % maxShownThumbnails === 0 ? 0 : 1);

    let thumbnailImage = document.querySelector('.thumbnails img');
    let imgHeight = thumbnailImage ? thumbnailImage.offsetHeight : 0;
    let imgStyle = window.getComputedStyle(thumbnailImage);
    let marginBottom = imgStyle.marginBottom;
    // the gap between thumbnails can be fractional (it's sized from the column's height in CSS)
    marginBottom = parseFloat(marginBottom);

    let itemHeight = imgHeight + marginBottom;
    let scrollTo = 0;
    // let thumbnailsWrapperHeight = itemHeight * maxShownThumbnails;
    let thumbnailsWrapperHeight = document.querySelector('.thumbnails-wrapper').offsetHeight;


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
        // The thumbnail column follows the main image's height, so its window and the thumbnail
        // spacing change with the screen width: update the sizes the scrolling uses, and keep the
        // column on the same thumbnails
        // (on narrow screens the column is hidden and measures 0: keep the last sizes for when it's back)
        let newWrapperHeight = document.querySelector('.thumbnails-wrapper').offsetHeight;
        if (thumbnailImage && newWrapperHeight > 0) {
            if (thumbnailsWrapperHeight > 0 && scrollTo > 0) {
                scrollTo = scrollTo * newWrapperHeight / thumbnailsWrapperHeight;
                thumbnailContainer.style.transform = `translateY(-${scrollTo}px)`;
            }
            thumbnailsWrapperHeight = newWrapperHeight;
            imgHeight = thumbnailImage.offsetHeight;
            imgStyle = window.getComputedStyle(thumbnailImage);
            marginBottom = parseFloat(imgStyle.marginBottom);
            itemHeight = imgHeight + marginBottom;
        }

        // Price Thumbnails
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


    function scrollThumbnailsFromPrice(num) {
        let scrollChecker = Math.ceil((num + 1) / maxShownThumbnails);
            if (scrollChecker === scrollNumber) { // shows last group of images
                scrollCounter = scrollChecker;
                if (images.length % maxShownThumbnails > 0) { // if num of last image group is less then maxShownThumbnails
                    scrollTo = thumbnailsWrapperHeight * (scrollCounter - 2) + itemHeight * (images.length % maxShownThumbnails); // + marginBottom * (scrollCounter - 1);
                } else {
                    scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1); // + marginBottom * (scrollCounter - 1);
                }
            } else {           
                    scrollCounter = scrollChecker;
                    scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1); // + marginBottom * (scrollCounter - 1);
            }

        thumbnailContainer.style.transform = `translateY(-${scrollTo}px)`; // Adjust based on thumbnail size and gap    
    } 


    function showImage(num) {
        currentImageIndex = num;
        // section = Math.ceil((currentImageIndex + 1) / maxShownThumbnails)
        const imageSrc = imagesSRC[num]; // Ռեալում սա պետք չի գա
        const image = document.getElementById('main-image');
        const thumbnails = document.querySelectorAll('.thumbnails img');
        thumbnails.forEach(thumbnail => thumbnail.classList.remove('selectedThumbnail'));
        image.classList.remove('fade');  // Reset animation
        void image.offsetWidth;  // Trigger reflow to restart the animation
        image.src = imageSrc;  // Update the source
        image.classList.add('fade');  // Add the fade class for transition
        
        const img = document.querySelector(`.thumbnails img[src="${imageSrc}"]`);
        if (img) {
            img.classList.add('selectedThumbnail')
            scrollPosition = num;
        } else {
            console.log('Image not found');
        }

    }

    function nextImage() {
        if (typeof currentImageIndex === "string") {
            currentImageIndex = Number(currentImageIndex);
        }

        if (currentImageIndex === images.length - 1) {
            currentImageIndex = 0;
        } else {
            currentImageIndex = currentImageIndex + 1;
            currentImageIndex = Math.min(currentImageIndex, images.length - 1);
        }

        showImage(currentImageIndex);
        scrollThumbnails('right', true);
    }

    function prevImage() {
        // currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
        if (typeof currentImageIndex === "string") {
            currentImageIndex = Number(currentImageIndex);
        }

        if (currentImageIndex === 0) {
            currentImageIndex = images.length - 1;
        } else {
            currentImageIndex = currentImageIndex - 1;
            // currentImageIndex = Math.min(currentImageIndex, images.length - 1);
        }
        showImage(currentImageIndex);
        scrollThumbnails('left', true);
    }


    // let nextScroll = maxShownThumbnails;

    const thumbnailContainer = document.querySelector('.thumbnails');





    function scrollThumbnails(direction, stop) {
        // Scroll up
        if (direction === 'left') {
            
            let scrollChecker = Math.ceil((scrollPosition + 1) / maxShownThumbnails);
            if (stop === true) { // Sliders
                if (scrollChecker === scrollNumber) { // shows last group of images
                    scrollCounter = scrollChecker;
                    if (images.length % maxShownThumbnails > 0) { // if num of last image group is less then maxShownThumbnails
                        scrollTo = thumbnailsWrapperHeight * (scrollCounter - 2) + itemHeight * (images.length % maxShownThumbnails);
                    } else {
                        scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1); // + marginBottom * (scrollCounter - 1)
                    }
                } else {
                        scrollCounter = scrollChecker;
                        scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1); //  + marginBottom * (scrollCounter - 1)
                }

            }
            
        
            if (stop === false) { // Thumbnails
                scrollCounter = scrollCounter - 1;
                if (scrollCounter === 0) { // In this case we are heading to the last section of thumbnails
                    scrollCounter = scrollNumber;
                } 
                if (scrollCounter === scrollNumber) {
                    if (images.length % maxShownThumbnails > 0) { // if num of last image group is less then maxShownThumbnails
                        scrollTo = thumbnailsWrapperHeight * (scrollCounter - 2) + itemHeight * (images.length % maxShownThumbnails); // + marginBottom * (scrollCounter - 2);
                    } else {
                        scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1); // + marginBottom * (scrollCounter - 1);
                    }
                } else {
                    scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1); // + marginBottom * (scrollCounter - 1);
                }
                
                
            }


        } else {
            // Scroll down
            if (stop === true) { // Sliders
                let scrollChecker = Math.floor(scrollPosition / maxShownThumbnails) + 1;
                if (scrollChecker !== scrollCounter) {
                    if (scrollChecker === scrollNumber) { // shows last group of images
                        if (images.length % maxShownThumbnails > 0) { // if num of last image group is less then maxShownThumbnails
                            scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1) + itemHeight * (images.length % maxShownThumbnails);
                        } else {
                            scrollTo = thumbnailsWrapperHeight * scrollCounter + marginBottom * scrollCounter;
                        }

                        scrollCounter = scrollChecker;
                    } else {
                        if (scrollChecker * maxShownThumbnails === scrollPosition + 1) {
                            scrollCounter = scrollChecker;
                            scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1);
                        }
                        scrollCounter = scrollChecker;
                        scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1);
                    }
                }

            }

            if (stop === false) { // Thumbnails
                if (scrollCounter === scrollNumber) {
                    scrollCounter = 1;
                    scrollTo = 0;       
                    
                } else if (scrollCounter === scrollNumber - 1) { 
                    if (images.length % maxShownThumbnails > 0) { // if num of last image group is less then maxShownThumbnails
                        
                        scrollTo = thumbnailsWrapperHeight * (scrollCounter - 1) + itemHeight * (images.length % maxShownThumbnails); // + marginBottom * (scrollCounter - 1);
                        scrollCounter = scrollCounter + 1;
                    } else {
                        
                        scrollTo = thumbnailsWrapperHeight * scrollCounter; // + marginBottom * scrollCounter;
                        scrollCounter = scrollCounter + 1;
                    }
                } else {
                    scrollTo = thumbnailsWrapperHeight * scrollCounter; // + marginBottom * scrollCounter;
                    scrollCounter = scrollCounter + 1;
                }
                
            }    
        }
        
        thumbnailContainer.style.transform = `translateY(-${scrollTo}px)`; // Adjust based on thumbnail size and gap
    }

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
        updateSpssButton();
    }

    // The show/hide-specifications button is only needed when the price on show has specifications
    function updateSpssButton() {
        const btn = document.querySelector('.spss-button');
        if (!btn) {
            return;
        }
        const shown = [...document.querySelectorAll('.productType')].find(block => block.style.display !== 'none');
        btn.classList.toggle('no-spss', !(shown && shown.querySelector('.spss')));
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

    updateSpssButton();

  

    function toggle_spss_elements() {
        document.querySelectorAll('.spss').forEach(el => {
            el.classList.toggle('spss-view');
          });
          
    }

    document.querySelectorAll('.spss-button i').forEach(btn => {
        btn.addEventListener('click', function() {
            toggle_spss_elements();
            if (btn.classList.contains('fa-circle-up')){
                btn.classList.remove('fa-circle-up');
                btn.classList.add('fa-circle-down');
            } else {
                btn.classList.remove('fa-circle-down');
                btn.classList.add('fa-circle-up');
            }
        });
    

    });

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
      
      
      
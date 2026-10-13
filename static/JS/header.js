
document.addEventListener('DOMContentLoaded', function() {
    
    let csrfToken = document.getElementById('csrfToket').value;

    function modal_message(textContent) {
        // Create modal elements
        const modal = document.createElement("div");
        modal.classList.add("modal", "quantity-alert");

        const modalContent = document.createElement("div");
        modalContent.classList.add("modal-content", "quantity-alert");

        const closeButton = document.createElement("span");
        closeButton.classList.add("close", "quantity-alert");
        closeButton.innerHTML = "&times;"; // "X" symbol

        const message = document.createElement("p");
        message.classList.add("quantity-alert");
        message.textContent = textContent;

        // Append elements to the modal
        modalContent.appendChild(closeButton);
        modalContent.appendChild(message);
        modal.appendChild(modalContent);

        // Append the modal to the body
        document.body.appendChild(modal);

        // Add styles dynamically
        const style = document.createElement("style");
        style.textContent = `
            .modal.quantity-alert {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0, 0, 0, 0.5);
            }

            .modal-content.quantity-alert {
                background-color: #fff;
                margin: 15% auto;
                padding: 20px;
                border: 1px solid #888;
                border-radius: 10px;
                width: 80%;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                animation: fadeIn 0.3s ease-in-out;
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .close.quantity-alert {
                color: #aaa;
                float: right;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                // text-align: right;
            }

            .close.quantity-alert:hover,
            .close.quantity-alert:focus {
                color: #000;
                text-decoration: none;
            }
        `;

        // Append styles to the document head
        document.head.appendChild(style);

        // Function to open the modal
        function openModal() {
            modal.style.display = "block";
        }

        // Function to close the modal
        function closeModal() {
            modal.style.display = "none";
        }

        openModal();

        closeButton.addEventListener("click", closeModal);

        window.addEventListener("click", (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });

        // Example: Add a button to trigger the modal
        // const openModalButton = document.createElement("button");
        // openModalButton.classList.add("open-modal-btn", "quantity-alert");
        // openModalButton.textContent = "Add Product";
        // document.body.appendChild(openModalButton);
    }

    function rotate(gearElement) {
        let angle = 0;
        setInterval(() => {
            angle = (angle + 5) % 360; 
            gearElement.style.transform = `rotate(${angle}deg)`;
        }, 50); 
    
    }

    function myLoader(color) {
        if (color === undefined) {
          color = 'crimson'
        }
        let loader = document.createElement('div'); // Create a div element for the loader
          loader.id = 'gear';
          loader.style.color = color;
          loader.style.fontSize = '20px';
          loader.style.display = 'inline-block';
          loader.textContent = '⚙';
          return loader;
    }


    // function basket() {
    //     let Cart = cookie.get('Cart', false);
    //     let notification = document.querySelector('.notification');
    //     const aTag = notification.parentNode.parentNode;
    //     if (Cart === false) {
    //         notification.innerHtml = '';
    //         notification.style.display = 'none';
    //         aTag.href = window.location.origin + '/cart';
    //     } else {

    //         get_cart_content(Cart).then(response => {
    //             let prData = response.content.result.data;

    //             let arr = Cart.split('&');
    //             let cartCount = 0;

    //             arr.forEach(item => {
    //                 let itemArr = item.split('-');

    //                 let ptIDCookie = parseInt(itemArr[0]);
    //                 let countCookie = parseInt(itemArr[1]);

    //                 prData.forEach(row => {
    //                     if (parseInt(row['ptID']) === ptIDCookie) {               
    //                         let amount = countCookie;
    //                         if (countCookie > parseInt(row['quantity'])) {
    //                             amount = parseInt(row['quantity'])
    //                         }
    //                         cartCount = cartCount + amount;
    //                     }
    //                 });

    //             });

    //             document.querySelector('.basket').src = document.getElementById('full-basket').value;


    //             notification.textContent = cartCount.toString();
    //             notification.style.display = 'block';
    
    //             aTag.href = window.location.origin + '/cart/' + Cart;

    //         }).catch(error => {
    //             console.error(error);
    //         });
            
    //     }

    // }

    function addToQuantity(clickedBotton, num) {
        const container = clickedBotton.closest('.cart-container');
        const quantityInput = container.querySelector('input.quantity');

        if (quantityInput) {
            // const currentValue = parseInt(quantityInput.value, 10) || 0;
            quantityInput.value = num;
        }
    } 

    // Add to card
    async function addToCart(ptID, num, clickedBotton) {
        let checkPtQuantity = await check_pt_quantity(ptID, num);

        if (checkPtQuantity.status === '0') {
            // const textContent = document.getElementById('outOfStock').value;
            modal_message(checkPtQuantity.answer);
            return;
        }
        
        // Max allowed quantity to purchase or max quantity in stoke 
        if (checkPtQuantity.status === '2') {
            modal_message(checkPtQuantity.answer);
            addToQuantity(clickedBotton, checkPtQuantity.max);
            num = parseInt(checkPtQuantity.max);
        }
        
        

        let Cart = cookie.get('Cart');
        let flagID = false;
        let flagNum = false;
        let newPt = false;
        let newCookie = '';
        if (Cart) {
            arr = Cart.split('&');
            arr.forEach(item => {
                array = item.split('-');
                if (array[0] === ptID) {
                    flagID = true; 
                    if (array[1] === num) {
                        flagNum = true; 
                        return;
                    } else {
                        let newItem = ptID + '-' + num;
                        newCookie = newCookie + '&' + newItem;
                    }  

                } else { 
                    newPt = true;
                    newCookie = newCookie + '&' + item;
                }
                
            });
            newCookie = newCookie.substring(1);
            
        } else {
            newCookie = ptID + '-' + num;   
        }
        
        if (flagNum === true) {
            let textContent = document.getElementById('cartMessage').value;
            if (textContent) {
                modal_message(textContent);
            } else {
                modal_message("You have already added this product to the basket. You can change the quantity.");
            }
            return;
        } else {

            if (newPt === true && flagID === false) {
                newCookie = Cart + '&' + ptID + '-' + num;  
            }
            
            // Set new Cookies   
            cookie.set('Cart', newCookie, { expires: 7, path: '/' })  
            // basket();
            const inBasket = document.getElementById('inBasketText').value;

            clickedBotton.childNodes.forEach(node => {
                // Check if the node is a text node and not just whitespace
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length) {
                    node.textContent = ' ' + inBasket; 
                }
            });

        }

    }


    let cartState = false
    const addToCartBtns = document.getElementsByClassName('add-to-cart-btn');
    const quantity = document.getElementsByClassName('quantity');
    for (let i = 0; i < addToCartBtns.length; i++) {
        addToCartBtns[i].onclick = function() {
            if (cartState) {
                return;
            }
            cartState = true;
            
            let clickedBotton = addToCartBtns[i];

            let loader = myLoader();    
    
            clickedBotton.appendChild(loader);
        
            let gearElement = document.getElementById('gear');
            if (!gearElement) {
              return;
            } 
        
            rotate(gearElement);
            // clickedBotton.textContent = '{{ _("Adding ") }}';
            let ptID = clickedBotton.value;
            let num = quantity[i].value;
            addToCart(ptID, num, clickedBotton);  
            
            // setTimeout(() => (gearElement.remove(), 3050)); 
            gearElement.remove();
            
            cartState = false;
        };
    }

    // Array.from(quantity).forEach(input => {
    //     input.addEventListener('keyup', function(e) {
    //         if (e.target === input && e.target.value !== undefined) {
    //             let quantity = e.target.value.replace(/^0+/, ''); // Remove leading zeros
    //             quantity = parseInt(quantity, 10) || 0; // Convert to numeric, default to 0 if invalid
    //             e.target.value = quantity; // Update the input value

                
                
    //     // clickedBotton = input.parentNode.querySelector('.add-to-cart-btn');
    //     // ptID = clickedBotton.value;   
    //     // addToCart(ptID, quantity, clickedBotton);

    //     // console.log(quantity)
    //         }

    //     });
    // });


    const inputs = document.querySelectorAll(".quantity");
    inputs.forEach(input => {
        input.addEventListener("keyup", (e) => {
            if (e.target) {
                if (input.value == "") {
                    return;
                }    
                
                let quantity = 0;
                if (input.value !== "" && parseInt(input.value) < 1) {
                    input.value = 1;
                    quantity = 1; 
                } else {
                    quantity = input.value.replace(/^0+/, ''); // Remove leading zeros
                    input.value = quantity;
                    
                }

                
                clickedBotton = input.parentNode.querySelector('.add-to-cart-btn');
                ptID = clickedBotton.value;   
                addToCart(ptID, quantity, clickedBotton);
                
            }    
        
        });
    });

    
    // Buy now
    let buyNowBtns = document.querySelectorAll('.buy-btn');
    for (let i = 0; i < buyNowBtns.length; i++) {
        buyNowBtns[i].onclick = function() {
            const quantity = buyNowBtns[i].parentNode.querySelector('.quantity').value;
            if (parseInt(quantity) < 1) {
                return;
            }

            check_pt_quantity(this.value, quantity).then(response => {

                if (response.status === '1') {
                    window.location.href = `/buy-now/${this.value}-${quantity}`;
                } else {
                    modal_message(response.answer);
                }  

            }).catch(error => {
                console.error(error);
            });

        };
    }

    // basket();

    // Check if product type exists in specified quantity
    // Returns bool    
    async function check_pt_quantity(ptID, num) {
        let languageID = '';
        if (document.getElementById('language-id')) {
            languageID = document.getElementById('language-id').value;
        }

        let formData = new FormData();
        formData.append('ptID', ptID);
        formData.append('num', num);
        formData.append('languageID', languageID);
    
        try {
            let response = await fetch('/check-pt-quantity', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                },
                body: formData,
            });
    
            if (response.ok) {
                let data = await response.json();
                if (data.status === '0') {
                    return {'status': '0', 'answer': data.answer}
                } 
                
                if (data.status === '1') {
                    return {'status': '1'}
                }
                
                if (data.status === '2') {
                    return {'status': '2', 'answer': data.answer, 'max': data.max}
                } 


            } else {
                throw new Error('Request failed');
            }
        } catch (error) {
            console.error(error);
            return false; 
        }
    }


    function checkAddItems() {
        let Cart = cookie.get('Cart');
        if (Cart) {
            const inBasket = document.getElementById('inBasketText').value;
            const arr = Cart.split('&');
            
            arr.forEach(item => {
                let array = item.split('-');
                let ptID = array[0];
                let quantity = array[1];
                
                
                let buttons = document.querySelectorAll('.add-to-cart-btn');
                buttons.forEach(button => {
                    if (button.value === ptID) {
                        addToQuantity(button, quantity)

                        button.childNodes.forEach(node => {
                            // Check if the node is a text node and not just whitespace
                            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length) {
                                node.textContent = ' ' + inBasket; 
                            }
                        });
                    }
                });
                
            });
        }
    }

    checkAddItems();

    
    // async function get_cart_content(newCookies) {

    //     let formData = new FormData();
    //     formData.append('cart-data', newCookies);

    //     let xhr = new XMLHttpRequest();
        
    //     xhr.open('POST', '/cart');
        
    //     xhr.setRequestHeader('X-CSRFToken', csrfToken);

    //     xhr.onload = function () {
    //         if (xhr.status === 200) {
    //             let response = JSON.parse(xhr.responseText);
    //             return response

    //         } else {
    //             console.error('Error:', xhr.responseText);
    //         }
    //     };

    //     // Send the request with the FormData object
    //     xhr.send(formData);

    // }

    function get_cart_content(newCookies) {
        return new Promise((resolve, reject) => {
            let formData = new FormData();
            formData.append('cart-data', newCookies);
    
            let xhr = new XMLHttpRequest();
            xhr.open('POST', '/cart');
            xhr.setRequestHeader('X-CSRFToken', csrfToken);
    
            xhr.onload = function () {
                if (xhr.status === 200) {
                    try {
                        let response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    reject(new Error('Error: ' + xhr.responseText));
                }
            };
    
            xhr.onerror = function () {
                reject(new Error('Network Error'));
            };
    
            xhr.send(formData);
        });
    }
    

});


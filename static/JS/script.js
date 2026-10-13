let csrf = csrfToken;
const emailRequired = document.getElementById('emailRequired').value;
const invalidEmail = document.getElementById('invalidEmail').value;
const subscribeText = document.getElementById('subscribe').textContent;
const submitText = document.getElementById('message').textContent;
const redFields = document.getElementById('redFields').value;

// Validation errors use the site's blue (see .is-invalid in static/css/landing.css)
const ERROR_BORDER = '1px solid #15698a';
const ERROR_COLOR = '#0c4464';
const ERROR_BACKGROUND = 'rgba(21, 105, 138, 0.08)';

function showSubscribeError(text) {
    const box = document.getElementById('subscribe-message');
    box.textContent = text;
    box.classList.remove('hidden');
    box.style.border = ERROR_BORDER;
    box.style.color = ERROR_COLOR;
    box.style.background = ERROR_BACKGROUND;
    box.style.display = 'block';
    document.getElementById('subscribe-email').classList.add('is-invalid');
}

// Correcting the email closes the error (it slides away, see .newsletter .form-status in landing.css)
document.getElementById('subscribe-email').addEventListener('input', function () {
    if (!this.classList.contains('is-invalid')) return;
    this.classList.remove('is-invalid');
    document.getElementById('subscribe-message').classList.add('hidden');
});

// Scrolls to the "Send us a message" heading (the fixed header is allowed for by scroll-padding-top)
function scrollToMessageHeading() {
    const heading = document.querySelector('.message-card__title');
    if (!heading) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}


function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    const value = email.trim();

    const re = /^[\w\.-]+@[\w\.-]+\.\w+$/;
    return re.test(value);
    }


function myLoader(color, gearID) {
    if (color === undefined) {
    color = 'crimson'
    }

    if (gearID === undefined) {
    gearID = 'gear'
    }
    let loader = document.createElement('div'); // Create a div element for the loader
    loader.id = gearID;
    loader.style.color = color;
    loader.style.fontSize = '20px';
    loader.style.display = 'inline-block';
    loader.textContent = '⚙';
    return loader;
}


function rotate(gearElement) {
    let angle = 0;
    setInterval(() => {
        angle = (angle + 5) % 360; 
        gearElement.style.transform = `rotate(${angle}deg)`;
    }, 50); 

}


function errorMC_view(mode) {
    if (mode === 0) {
        // document.getElementById('error-message').classList.add('hidden')
        document.getElementById('error-message').style.border = '1px solid #10b981';
        document.getElementById('error-message').style.color = '#10b981';
        document.getElementById('error-message').style.background = 'rgba(16, 185, 129, 0.1)';
        document.getElementById('error-message').style.display = 'none';
    }
    
    if (mode === 1) {
        // document.getElementById('error-message').classList.remove('hidden');
        document.getElementById('error-message').style.border = ERROR_BORDER;
        document.getElementById('error-message').style.color = ERROR_COLOR;
        document.getElementById('error-message').style.background = ERROR_BACKGROUND;
        document.getElementById('error-message').style.display = 'block';
    }
}
// Subscribe function
let sFlag = false;
document.querySelector('#subscribe').addEventListener('click', function() {
    if (sFlag) {
    return;
    }

    let csrfToken = csrf;

sFlag = true;
document.getElementById('subscribe-message').classList.add('hidden')
document.getElementById('subscribe-message').style.border = '1px solid #10b981';
document.getElementById('subscribe-message').style.color = '#10b981';
document.getElementById('subscribe-message').style.background = 'rgba(16, 185, 129, 0.1)';
document.getElementById('subscribe-email').classList.remove('is-invalid');
let Email = document.getElementById('subscribe-email').value;
if (Email === '') {
    showSubscribeError(emailRequired);
    sFlag = false;
    return;
}

if (!isValidEmail(Email)) {
    showSubscribeError(invalidEmail);
    sFlag = false;
    return;
}


let loader = myLoader('#e1d7cc');    

    document.getElementById('subscribe').innerHTML = '';
    document.getElementById('subscribe').appendChild(loader);

    let gearElement = document.getElementById('gear');
    if (!gearElement) {
        gearElement.remove();
        document.getElementById('subscribe').textContent = subscribeText;
        sFlag = false;
        return;
    } 

    rotate(gearElement);

    let formData = new FormData();

    formData.append('Email', Email)     

    // Create a new XMLHttpRequest object
    let xhr = new XMLHttpRequest();
    // Configure the request
    xhr.open('POST', '/subscribe');
    xhr.setRequestHeader('X-CSRFToken', csrfToken);

    // Define what happens on successful data submission
    xhr.onload = function () {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            gearElement.remove();
            document.getElementById('subscribe').textContent = subscribeText;
            if (response.status === '1') {
                let content = safeMessage(response.answer);
                document.querySelector('#subscribe-message').innerHTML = content;
                document.querySelector('#subscribe-message').style.color = 'green';
                
            }
            
            if (response.status === '0') {
            let content = safeMessage(response.answer);
            document.querySelector('#subscribe-message').innerHTML = content;
            document.querySelector('#subscribe-message').style.border = ERROR_BORDER;
            document.querySelector('#subscribe-message').style.color = ERROR_COLOR;
            document.querySelector('#subscribe-message').style.background = ERROR_BACKGROUND;
            }
            
            document.querySelector('#subscribe-message').classList.remove('hidden');
            document.querySelector('#subscribe-message').style.display = 'block';
        } 
        sFlag = false;
    };

    // Define what happens in case of error
    xhr.onerror = function () {
        console.error('Request failed.');
    };

    // Send the request with the JSON data
    xhr.send(formData);
});

let cmFlag = false;
document.getElementById('message').addEventListener('click', function() {
    event.preventDefault();
    if (cmFlag) {
    return;
    } 

    scrollTarget = document.querySelector('#contacts');
    
    cmFlag = true;
    let loader = myLoader('#e1d7cc');    
    
    document.getElementById('message').innerHTML = '';
    document.getElementById('message').appendChild(loader);

    let gearElement = document.getElementById('gear');
    if (!gearElement) {
        gearElement.remove();
        document.getElementById('message').textContent = subscribeText;
        cmFlag = false;
        return;
    } 

    rotate(gearElement);

    let errorMC = document.getElementById('error-message');
    // errorMC.classList.add('hidden');
    // errorMC.style.display = 'none';
    errorMC_view(0)

    const form = document.querySelector('.messageForm');

    let isValid = true;
    let errorMessages = [];
    
    // Get all input and textarea elements inside the form
    const elements = form.querySelectorAll('input, textarea');
    let formData = new FormData();

    
    elements.forEach(function(element) {
    // Get the element's ID and trimmed value
    const id = element.getAttribute('id');
    const value = element.value.trim();

    // Log values for debugging purposes
    console.log(`Element ID: ${id}, Value: ${value}`);

    // Fields corrected since the last attempt are no longer highlighted
    element.classList.remove('is-invalid');

    // Check if the value exists (non-empty)
    if (value === '') {
        isValid = false;
        // errorMessages.push(`The field '${id}' is required.`);
        element.classList.add('is-invalid');
    }

    // If the element is an email input, perform email validation
    if (element.type === 'email' && value !== '') {
        // Simple email validation regex pattern
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
        isValid = false;
        element.classList.add('is-invalid');
        errorMessages.push(invalidEmail);
        }
    }

    formData.append(id, value); 
    });
    
    // If there are validation errors, display them and do not proceed
    if (!isValid) {
    errorMC.innerHTML = `<p>${redFields}` + '</p><p>' + errorMessages.join('</p>');
    errorMC_view(1)
    gearElement.remove();
    document.getElementById('message').textContent = submitText;
    cmFlag = false;
    scrollToMessageHeading();
    return;  // Stop here if any error was found
    }

    // Otherwise, the form is valid. You can process the form data or submit it.
    form.querySelectorAll('input, textarea').forEach(function(element) {
    element.classList.remove('is-invalid');
    });

    formData.append('languageID', languageID); 

    // Create a new XMLHttpRequest object
    let xhr = new XMLHttpRequest();
    let csrfToken = csrf;
    // Configure the request
    xhr.open('POST', '/client-message');
    xhr.setRequestHeader('X-CSRFToken', csrfToken);

    // Define what happens on successful data submission
    xhr.onload = function () {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            gearElement.remove();
            document.getElementById('message').textContent = submitText;
            // cmFlag = false;
            if (response.status === '1') {
                let content = safeMessage(response.answer);
                errorMC.innerHTML = content;
                errorMC.style.color = 'green';
                
            }
            
            if (response.status === '0') {
                let content = safeMessage(response.answer);
                errorMC.style.border = ERROR_BORDER;
                errorMC.style.color = ERROR_COLOR;
                errorMC.style.background = ERROR_BACKGROUND;
                errorMC.innerHTML = content;
            }
            
            errorMC.classList.remove('hidden');
            errorMC.style.display = 'block';
            scrollTarget.scrollIntoView({ behavior: 'smooth' });

        } 
        cmFlag = false;
    };

    // Define what happens in case of error
    xhr.onerror = function () {
        console.error('Request failed.');
    };

    // Send the request with the JSON data
    xhr.send(formData);
});

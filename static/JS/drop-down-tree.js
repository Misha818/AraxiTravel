document.addEventListener('DOMContentLoaded', () => {
    const selectedLabel = document.getElementById('selected-label');
    const parentOptions = document.getElementById('parent-options');
    const parentItems = document.querySelectorAll('#parent-options .option');

    // Keep track of the last clicked child to revert its style if needed
    let lastSelectedChild = null;
    if (document.getElementsByClassName('.selected-child')) {
        let lastSelectedChild = document.querySelector('.selected-child');
    } 



    // 1) Toggle the list of parent items when the top label is clicked
    selectedLabel.addEventListener('click', (e) => {
      parentOptions.classList.toggle('hidden');
    });

    // 2) For each parent, populate or toggle children on click
    parentItems.forEach((parentItem) => {
      // parentItem.addEventListener('click', (e) => {
      parentItem.addEventListener('click', (e) => {
        // Prevent the click from closing the parent list
        e.stopPropagation();
        
        // Hide children of ALL other parents first
        parentItems.forEach((otherItem) => {
          if (otherItem !== parentItem) {
            const otherChildContainer = otherItem.querySelector('.child-options');
            otherChildContainer.classList.add('hidden');
          }

        });

        // Get the child container for this parent
        const childContainer = parentItem.querySelector('.child-options');

        // If it's already populated, just toggle it
        if (childContainer.innerHTML.trim() !== '') {
          childContainer.classList.toggle('hidden');
          // document.querySelector('#parent-options').classList.toggle('hidden');
          return;
        }

        // Otherwise, create child items from data-children
        const children = parentItem.getAttribute('data-children').split('_sppr_');
        children.forEach((childInfo) => {
          
          let childArr = childInfo.split('_sp_');
          let childValue = childArr[0];
          let childName = childArr[1];

          const childDiv = document.createElement('div');
          if (childValue === 'null') {
              childName = 'Click on me to add a product type'
              childDiv.className = 'child-option';
              childDiv.textContent = childName;
              childDiv.dataset.value = childValue.trim();
              ptA = document.createElement('a');
              ptA.href = window.origin + '/add-price/' + parentItem.getAttribute('data-value')
              ptA.appendChild(childDiv)
              childContainer.appendChild(ptA);
              
          } else {

              childDiv.className = 'child-option';
              childDiv.textContent = childName.trim();
              childDiv.dataset.value = childValue.trim();
              childContainer.appendChild(childDiv);
              
            } 
          // Child click event
          childDiv.addEventListener('click', (childEvent) => {
            childEvent.stopPropagation(); // Prevent parent click
            // 2a) Revert style of previously selected child (if any)
            let lastSelectedChild = document.querySelector('.selected-child');
            if (lastSelectedChild) {
              lastSelectedChild.classList.remove('selected-child');
            }

            // 2b) Highlight the newly selected child
            childDiv.classList.add('selected-child');
            lastSelectedChild = childDiv;

            // 2c) Update top label to the child's name
            selectedLabel.textContent = parentItem.getAttribute('data-parent') + ': ' + childDiv.textContent;
            selectedLabel.dataset.value = childDiv.getAttribute('data-value');
            // 2d) Hide the entire dropdown (parent list)
            
            // document.getElementById('parent-options').classList.add('hidden');
            parentOptions.classList.add('hidden');
            
          });
        });

        // Show the newly populated child container
        childContainer.classList.remove('hidden');
      });
    });
    
      // (Optional) If user clicks anywhere outside the dropdown, close it
      document.addEventListener('click', (e) => {
        // If the click is not inside the dropdown or its children, hide it
        const isClickInside = e.target.closest('.dropdown');
        if (!isClickInside) {
          parentOptions.classList.add('hidden');
        }
      });

      
    });
    


    const restoreDict = {'_unwanted_backthick_': '`', '_unwanted_doublequate_': '"', "_unwanted_singlequate_": "'"}
    function restoreUnwantedJsonChars(Text) {
        restoreDictKeys = Object.keys(restoreDict);
        restoreDictKeys.forEach(function(key) {
           if (Text && Text.includes(key)) {
               Text = Text.replace(key, restoreDict[key]);
           }
        });

        return Text;
    }

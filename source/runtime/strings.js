/**
@fileOverview
Implementation of string operations.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010-2011 Maxime Chevalier-Boisvert, All Rights Reserved
*/

/**
Allocate and initialize the string table, used for hash consing
*/
function initStrTable()
{
    "tachyon:static";
    "tachyon:noglobal";

    // Allocate the string table object
    var strtbl = alloc_strtbl(STR_TBL_INIT_SIZE);

    // Initialize the string table size and number of properties
    set_strtbl_tblsize(strtbl, iir.icast(IRType.i32, STR_TBL_INIT_SIZE));
    set_strtbl_numstrs(strtbl, i32(0));

    // Initialize the string table entries
    for (var i = pint(0); i < STR_TBL_INIT_SIZE; i += pint(1))
        set_strtbl_tbl(strtbl, i, UNDEFINED);

    // Get a pointer to the context
    var ctx = iir.get_ctx();

    // Set the string table reference in the context
    set_ctx_strtbl(ctx, strtbl);
}

/**
Given a string object, try to find the same string in the hash consing
table. If found, a reference to that string is returned. Otherwise, the
string is added to the hash table and the reference to that string is
returned.
*/
function getTableStr(strObj)
{
    "tachyon:static";
    "tachyon:noglobal";

    //
    // Hash table lookup
    //

    // Get a pointer to the context
    var ctx = iir.get_ctx();

    // Get a pointer to the string table
    var strtbl = get_ctx_strtbl(ctx);

    // Get the size of the string table
    var tblSize = iir.icast(
        IRType.pint,
        get_strtbl_tblsize(strtbl)
    );

    // Get the hash code from the string object
    var hashCode = get_str_hash(strObj);

    // Get the hash table index for this hash value
    // compute this using unsigned modulo to always obtain a positive value
    var hashIndex = iir.icast(
        IRType.pint,
        iir.icast(IRType.u32, hashCode) % iir.icast(IRType.u32, tblSize)
    );

    /*
    print("Hash lookup");
    print(strObj);
    printInt(boxInt(hashIndex));
    */

    // Until the key is found, or a free slot is encountered
    while (true)
    {
        // Get the string value at this hash slot
        var strVal = get_strtbl_tbl(strtbl, hashIndex);

        // If we have reached an empty slot
        if (strVal === UNDEFINED)
        {
            // Break out of the loop
            break;
        }

        // Otherwise, if this is the string we want
        else if (streq(strVal, strObj))
        {
            // Return a reference to the string we found in the table
            return strVal;
        }

        // Move to the next hash table slot
        hashIndex = (hashIndex + pint(1)) % tblSize;
    }

    //
    // Hash table updating
    //

    // Set the corresponding key and value in the slot
    set_strtbl_tbl(strtbl, hashIndex, strObj);

    // Get the number of strings and increment it
    var numStrings = get_strtbl_numstrs(strtbl);
    numStrings += i32(1);
    set_strtbl_numstrs(strtbl, numStrings);
    numStrings = iir.icast(IRType.pint, numStrings);

    // Test if resizing of the string table is needed
    // numStrings > ratio * tblSize
    // numStrings > num/denom * tblSize
    // numStrings * denom > tblSize * num
    if (numStrings * STR_TBL_MAX_LOAD_DENOM >
        tblSize * STR_TBL_MAX_LOAD_NUM)
    {
        // Extend the string table
        extStrTable(strtbl, tblSize, numStrings);
    }

    // Return a reference to the string object passed as argument
    return strObj;
}

/**
Extend the string table and rehash its contents
*/
function extStrTable(curTbl, curSize, numStrings)
{
    "tachyon:inline";
    "tachyon:noglobal";
    "tachyon:arg curSize pint";
    "tachyon:arg numStrings pint";

    // Compute the new table size
    var newSize = curSize * pint(2) + pint(1);

    // Allocate a new, larger hash table
    var newTbl = alloc_strtbl(newSize);

    // Initialize the new table entries
    for (var i = pint(0); i < newSize; i += pint(1))
        set_strtbl_tbl(newTbl, i, UNDEFINED);

    // Set the new size and the number of strings stored
    set_strtbl_tblsize(newTbl, iir.icast(IRType.i32, newSize));
    set_strtbl_numstrs(newTbl, iir.icast(IRType.i32, numStrings));

    // For each entry in the current table
    for (var curIdx = pint(0); curIdx < curSize; curIdx += pint(1))
    {
        // Get the value at this hash slot
        var slotVal = get_strtbl_tbl(curTbl, curIdx);

        // If this slot is empty, skip it
        if (slotVal === UNDEFINED)
            continue;

        // Get the hash code for the value
        // Boxed value, may be a string or an int
        var valHash = getHash(slotVal);

        // Get the hash table index for this hash value in the new table
        var startHashIndex = iir.icast(
            IRType.pint,
            iir.icast(IRType.u32, valHash) % iir.icast(IRType.u32, newSize)
        );
        var hashIndex = startHashIndex;

        // Until a free slot is encountered
        while (true)
        {
            // Get the value at this hash slot
            var slotVal2 = get_strtbl_tbl(newTbl, hashIndex);

            // If we have reached an empty slot
            if (slotVal2 === UNDEFINED)
            {
                // Set the corresponding key and value in the slot
                set_strtbl_tbl(newTbl, hashIndex, slotVal);

                // Break out of the loop
                break;
            }

            // Move to the next hash table slot
            hashIndex = (hashIndex + pint(1)) % newSize;

            // Ensure that a free slot was found for this key
            assert (
                boolToBox(hashIndex !== startHashIndex),
                'no free slots found in extended hash table'
            );
        }
    }

    // Get a pointer to the context
    var ctx = iir.get_ctx();

    // Update the string table reference in the context
    set_ctx_strtbl(ctx, newTbl);
}

/**
Find/allocate a string object in the hash consing table from raw string data.
*/
function getStrObj(rawStr, strLen)
{
    "tachyon:static";
    "tachyon:noglobal";
    "tachyon:arg rawStr rptr";
    "tachyon:arg strLen pint";

    // Create a string object from the raw string data
    var strObj = rawStrToObj(rawStr, strLen);

    // Find/put the string in the string table
    var str = getTableStr(strObj);

    // Return the string from the string table
    return str;
}

/**
Compare two string objects by iterating over UTF-16 code units
This conforms to section 11.8.5 of the ECMAScript 262 specification
NOTE: this is used to find strings in the hash consing table
*/
function streq(str1, str2)
{
    "tachyon:static";
    "tachyon:noglobal";
    "tachyon:ret bool";

    // Get the length of both strings
    var len1 = iir.icast(IRType.pint, get_str_len(str1));
    var len2 = iir.icast(IRType.pint, get_str_len(str2));

    // If the lengths aren't equal, the strings aren't equal
    if (len1 !== len2)
        return FALSE_BOOL;

    // For each character to be compared
    for (var i = pint(0); i < len1; i += pint(1))
    {
        var ch1 = get_str_data(str1, i);
        var ch2 = get_str_data(str2, i);

        if (ch1 !== ch2)
            return FALSE_BOOL;
    }

    // The strings are equal
    return TRUE_BOOL;
}

/**
Concatenate the strings from two string objects
*/
function strcat(str1, str2)
{
    "tachyon:static";
    "tachyon:noglobal";

    // Get the length of both strings
    var len1 = iir.icast(IRType.pint, get_str_len(str1));
    var len2 = iir.icast(IRType.pint, get_str_len(str2));

    // Compute the length of the new string
    var newLen = len1 + len2;

    // Allocate a string object
    var newStr = alloc_str(newLen);
    
    // Set the string length in the new string object
    set_str_len(newStr, iir.icast(IRType.i32, newLen));

    // Copy the character data from the first string
    for (var i = pint(0); i < len1; i += pint(1))
    {
        var ch = get_str_data(str1, i);
        set_str_data(newStr, i, ch);
    }

    // Copy the character data from the second string
    for (var i = pint(0); i < len2; i += pint(1))
    {
        var ch = get_str_data(str2, i);
        set_str_data(newStr, len1 + i, ch);
    }

    // Compute the hash code for the new string
    compStrHash(newStr);

    // Find/add the concatenated string in the string table
    return getTableStr(newStr);
}

/**
Create a string object from raw string data
*/
function rawStrToObj(rawStr, strLen)
{
    "tachyon:static";
    "tachyon:noglobal";
    "tachyon:arg rawStr rptr";
    "tachyon:arg strLen pint";

    // Allocate a string object
    var strObj = alloc_str(strLen);
    
    // Set the string length in the string object
    set_str_len(strObj, iir.icast(IRType.i32, strLen));

    // Copy the character data into the string object
    for (var index = pint(0); index < strLen; index += pint(1))
    {
        // Get the current character
        var ch = iir.load(IRType.u16, rawStr, pint(2) * index);

        // Copy the character into the string object
        set_str_data(strObj, index, ch);
    }

    // Compute the hash code for the new string
    compStrHash(strObj);

    // Return the string object
    return strObj;
}

/**
Compute and set the hash code for a string object
*/
function compStrHash(strObj)
{
    "tachyon:static";
    "tachyon:noglobal";

    // Get the string length
    var len = iir.icast(IRType.pint, get_str_len(strObj));

    // Initialize the hash code to 0
    var hashCode = u32(0);

    // Initialize the integer value to 0
    var intVal = u32(0);

    // Flag indicating that the string represents an integer
    var isInt = TRUE_BOOL;

    // For each character, update the hash code
    for (var i = pint(0); i < len; i += pint(1))
    {
        // Get the current character
        var ch = iir.icast(IRType.u32, get_str_data(strObj, i));

        // If this character is a digit
        if (ch >= u32(48) && ch <= u32(57))
        {
            // Update the number value
            var digitVal = ch - u32(48);
            intVal = u32(10) * intVal + digitVal;
        }
        else
        {
            // This string does not represent a number
            isInt = FALSE_BOOL;
        }

        // Update the hash code
        hashCode = (((hashCode << u32(8)) + ch) & u32(536870911)) % u32(426870919);
    }

    // If this is an integer value within the supported range
    if (len > pint(0) && isInt && intVal < HASH_CODE_STR_OFFSET)
    {
        printInt(1337);

        // Set the hash code to the integer value
        hashCode = intVal;
    }
    else
    {
        // Offset the string hash code to indicate this is not an integer value
        hashCode += HASH_CODE_STR_OFFSET;
    }

    // Set the hash code in the string object
    set_str_hash(strObj, iir.icast(IRType.i32, hashCode));
}

/**
Create/allocatr a C (UTF-8) string from a string object.
*/
function makeCString(strVal)
{
    "tachyon:static";
    "tachyon:noglobal";
    "tachyon:ret rptr";

    // Get the string length
    var strLen = iir.icast(IRType.pint, get_str_len(strVal));

    // Allocate memory for the C string
    var strPtr = malloc(strLen + pint(1));

    // For each character
    for (var i = pint(0); i < strLen; i += pint(1))
    {
        var ch = get_str_data(strVal, i);

        var cCh = iir.icast(IRType.i8, ch);

        iir.store(IRType.i8, strPtr, i, cCh);
    }

    // Store the null terminator
    iir.store(IRType.i8, strPtr, i, i8(0));

    return strPtr;
}

/**
Free a C string's memory buffer
*/
function freeCString(strPtr)
{
    "tachyon:static";
    "tachyon:noglobal";
    "tachyon:arg strPtr rptr";

    free(strPtr);

    return;
}

/**
Convert a boxed value to a string
*/
function boxToString(val)
{
    "tachyon:static";
    "tachyon:noglobal";

    // TODO: int to string conversion
    /*
    if (boxIsInt(val))
    {
    }
    */

    if (boxIsString(val))
    {
        return val;
    }

    // TODO: call toString on objects
    /*
    if (boxIsObj(val))
    {
    }
    */

    switch (val)
    {
        case UNDEFINED:
        return 'undefined';

        case null:
        return 'null';

        case true:
        return 'true';

        case false:
        return 'false';

        default:
        error('unsupported value type in boxToString');
    }
}


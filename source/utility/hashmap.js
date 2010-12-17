/**
@fileOverview
Implementation of a hash map data structure.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

// Initial hash map size
var HASH_MAP_INIT_SIZE = 89;

// Hash map min and max load factors
var HASH_MAP_MIN_LOAD_NUM = 1;
var HASH_MAP_MIN_LOAD_DENUM = 10;
var HASH_MAP_MAX_LOAD_NUM = 6;
var HASH_MAP_MAX_LOAD_DENUM = 10;

// Next object serial number to be assigned
var nextObjectSerial = 1;

/**
Default hash function implementation
*/
function defHashFunc(val)
{
    if (typeof val == 'number')
    {
        return Math.floor(val);
    }     
 
    else if (typeof val == 'string')  
    {
        var hashCode = 0;

        for (var i = 0; i < val.length; ++i)
            hashCode = (hashCode * 256 + val.charCodeAt(i)) % 426870919;

        return hashCode;
    }

    else if (typeof val == 'boolean')
    {
        return val? 1:0;
    }

    else if (val === null || val === undefined)
    {
        return 0;
    }

    else
    {
        if (!val.hasOwnProperty('__hashCode__'))
        {
            val.__hashCode__ = nextObjectSerial++;
        }

        return val.__hashCode__;
    }
}

/**
Default equality function
*/
function defEqualFunc(key1, key2)
{
    return key1 === key2;
}

// Key value for free hash table slots
var freeHashKey = [];

/**
@class Hash map implementation
*/
function HashMap(hashFunc, equalFunc)
{
    /**
    Add an item to the map
    */
    this.addItem = function (key, value)
    {
        // Ensure that the item is not already in the table
        assert (
            !this.hasItem(key),
            'cannot add item, key already in hash map'
        );

        var index = 2 * (this.hashFunc(key) % this.numSlots);

        // Until a free item slot is found
        while (this.array[index] !== freeHashKey)
            index = (index + 2) % this.array.length;
    
        // Insert the new item at the free slot
        this.array[index] = key;
        this.array[index + 1] = value;

        // Increment the number of items stored
        this.numItems++;

        // Test if resizing of the hash map is needed
        // numItems > ratio * numSlots
        // numItems > num/denum * numSlots 
        // numItems / num > numSlots / denum
        if (this.numItems / HASH_MAP_MAX_LOAD_NUM >
            this.numSlots / HASH_MAP_MAX_LOAD_DENUM
        )
        {
            this.resize(2 * this.numSlots + 1);
        }
    };

    /**
    Add or change a key-value binding in the map
    */
    this.setItem = function (key, value)
    {
        var index = 2 * (this.hashFunc(key) % this.numSlots);

        // Until a free cell is found
        while (this.array[index] !== freeHashKey)
        {
            // If this slot has the item we want
            if (this.equalFunc(this.array[index], key))
            {
                // Set the item's value
                this.array[index + 1] = value;

                // Exit the function
                return;
            }

            index = (index + 2) % this.array.length;
        }
    
        // Insert the new item at the free slot
        this.array[index] = key;
        this.array[index + 1] = value;

        // Increment the number of items stored
        this.numItems++;

        // Test if resizing of the hash map is needed
        // numItems > ratio * numSlots
        // numItems > num/denum * numSlots 
        // numItems / num > numSlots / denum
        if (this.numItems / HASH_MAP_MAX_LOAD_NUM >
            this.numSlots / HASH_MAP_MAX_LOAD_DENUM
        )
        {
            this.resize(2 * this.numSlots + 1);
        }
    };

    /**
    Remove an item from the map
    */
    this.remItem = function (key)
    {    
        var index = 2 * (this.hashFunc(key) % this.numSlots);

        // Until a free cell is found
        while (this.array[index] !== freeHashKey)
        {
            // If this slot has the item we want
            if (this.equalFunc(this.array[index], key))
            {
                // Initialize the current free index to the removed item index
                var curFreeIndex = index;

                // For every subsequent item, until we encounter a free slot
                for (var shiftIndex = (index + 2) % this.array.length;
                    this.array[shiftIndex] !== freeHashKey;
                    shiftIndex = (shiftIndex + 2) % this.array.length)
                {
                    // Calculate the index at which this item's hash key maps
                    var origIndex = 2 * (this.hashFunc(this.array[shiftIndex]) % this.numSlots);

                    // Compute the distance from the element to its origin mapping
                    var distToOrig =
                        (shiftIndex < origIndex)? 
                        (shiftIndex + this.array.length - origIndex):
                        (shiftIndex - origIndex);

                    // Compute the distance from the element to the current free index
                    var distToFree =
                        (shiftIndex < curFreeIndex)?
                        (shiftIndex + this.array.length - curFreeIndex):
                        (shiftIndex - curFreeIndex);                    

                    // If the free slot is between the element and its origin
                    if (distToFree <= distToOrig)
                    {
                        // Move the item into the free slot
                        this.array[curFreeIndex] = this.array[shiftIndex];
                        this.array[curFreeIndex + 1] = this.array[shiftIndex + 1];

                        // Update the current free index
                        curFreeIndex = shiftIndex;
                    }
                }

                // Clear the hash key at the current free position
                this.array[curFreeIndex] = freeHashKey;

                // Decrement the number of items stored
                this.numItems--;


                // If we are under the minimum load factor, shrink the internal array
                // numItems < ratio * numSlots 
                // numItems < num/denum * numSlots 
                // numItems / num < numSlots / denum
                if ((this.numItems / HASH_MAP_MIN_LOAD_NUM <
                     this.numSlots / HASH_MAP_MIN_LOAD_DENUM)
                    &&
                    this.numSlots > HASH_MAP_INIT_SIZE
                )
                {
                    this.resize((this.numSlots - 1) >> 1);
                }

                // Item removed
                return;
            }

            index = (index + 2) % this.array.length;
        }
    
        assert (false, 'cannot remove item, key not found');
    };

    /**
    Test if the map contains an item
    */    
    this.hasItem = function (key)
    {
        var index = 2 * (this.hashFunc(key) % this.numSlots);

        // Until a free cell is found
        while (this.array[index] !== freeHashKey)
        {
            // If this slot has the item we want
            if (this.equalFunc(this.array[index], key))
            {
                // Item found
                return true;
            }

            index = (index + 2) % this.array.length;
        }
    
        // Item not found
        return false;
    };

    /**
    Get an item in the map
    */
    this.getItem = function (key)
    {
        var index = 2 * (this.hashFunc(key) % this.numSlots);

        // Until a free cell is found
        while (this.array[index] !== freeHashKey)
        {
            // If this slot has the item we want
            if (this.equalFunc(this.array[index], key))
            {
                // Return the item's value
                return this.array[index + 1];
            }

            index = (index + 2) % this.array.length;
        }
    
        assert (false, 'cannot get item, key not found');
    };

    /**
    Get the keys present in the hash map
    */
    this.getKeys = function ()
    {
        var keys = [];

        for (var i = 0; i < this.numSlots; ++i)
        {
            var index = 2 * i;

            if (this.array[index] !== freeHashKey)
                keys.push(this.array[index]);
        }

        return keys;
    };

    /**
    Get an iterator for this hash map
    */
    this.getItr = function ()
    {
        return new HashMap.Iterator(this, 0);
    };

    /**
    Erase all contained items
    */
    this.clear = function ()
    {
        // Set the initial number of slots
        this.numSlots = HASH_MAP_INIT_SIZE;

        // Set the initial array size
        this.array.length = 2 * this.numSlots;

        // Reset each array key element
        for (var i = 0; i < this.numSlots; ++i)
            this.array[2 * i] = freeHashKey;

        // Reset the number of items stored
        this.numItems = 0;
    };

    /**
    Copy the map
    */
    this.copy = function ()
    {
        var newMap = new HashMap(this.hashFunc, this.equalFunc);

        newMap.numSlots = this.numSlots;
        newMap.array = this.array.slice(0);
        newMap.numItems = this.numItems;

        return newMap;
    };

    /**
    Resize the hash map's internal storage
    */
    this.resize = function (newSize)
    {
        // Ensure that the new size is valid
        assert (
            this.numItems <= newSize && Math.round(newSize) - newSize == 0,
            'cannot resize, more items than new size allows'
        );

        var oldNumSlots = this.numSlots;
        var oldArray = this.array;

        // Initialize a new internal array
        this.array = [];
        this.numSlots = newSize;
        this.array.length = 2 * this.numSlots;
        for (var i = 0; i < this.numSlots; ++i)
            this.array[2 * i] = freeHashKey;

        // Reset the number of elements stored
        this.numItems = 0;

        // Re-insert the elements from the old array
        for (var i = 0; i < oldNumSlots; ++i)
            if (oldArray[2 * i] !== freeHashKey)
                this.addItem(oldArray[2 * i], oldArray[2 * i + 1]);     
    };

    /**
    Number of internal array slots
    @field
    */
    this.numSlots = HASH_MAP_INIT_SIZE;

    /**
    Internal storage array
    @field
    */
    this.array = [];

    // Set the initial array size
    this.array.length = 2 * this.numSlots;

    // Initialize each array element
    for (var i = 0; i < this.numSlots; ++i)
        this.array[2 * i] = freeHashKey;

    /**
    Number of items stored
    @field
    */
    this.numItems = 0;

    // If no hash function was specified, use the default function
    if (hashFunc == undefined || hashFunc == null)
        hashFunc = defHashFunc;

    /**
    Hash function
    @field
    */
    this.hashFunc = hashFunc;

    // If no hash function was specified, use the default function
    if (equalFunc == undefined || equalFunc == null)
        equalFunc = defEqualFunc;

    /**
    Key equality function
    @field
    */
    this.equalFunc = equalFunc;
}

/**
@class Hash map iterator
*/
HashMap.Iterator = function (hashMap, slotIndex)
{
    /**
    Associated hash map
    @field
    */
    this.map = hashMap;

    /**
    Current hash map slot
    @field
    */
    this.index = slotIndex;

    // Move to the next non-free slot
    this.nextFullSlot();
};
HashMap.Iterator.prototype = {};

/**
Move the current index to the next non-free slot
*/
HashMap.Iterator.prototype.nextFullSlot = function ()
{
    while (
        this.index < this.map.array.length &&
        this.map.array[this.index] === freeHashKey
    )
        this.index += 2;
};

/**
Test if the iterator is at a valid position
*/
HashMap.Iterator.prototype.valid = function ()
{
    return (this.index < this.map.array.length);
};

/**
Move to the next list item
*/
HashMap.Iterator.prototype.next = function ()
{
    assert (
        this.valid(),
        'cannot move to next list item, iterator not valid'
    );

    // Move to the next slot
    this.index += 2;

    // Move to the first non-free slot found
    this.nextFullSlot();
};

/**
Get the current list item
*/
HashMap.Iterator.prototype.get = function ()
{
    assert (
        this.valid(),
        'cannot get current list item, iterator not valid'
    );

    return { 
        key: this.map.array[this.index],  
        value: this.map.array[this.index + 1] 
    };
};

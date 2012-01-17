/* _________________________________________________________________________
 *
 *             Tachyon : A Self-Hosted JavaScript Virtual Machine
 *
 *
 *  This file is part of the Tachyon JavaScript project. Tachyon is
 *  distributed at:
 *  http://github.com/Tachyon-Team/Tachyon
 *
 *
 *  Copyright (c) 2011, Universite de Montreal
 *  All rights reserved.
 *
 *  This software is licensed under the following license (Modified BSD
 *  License):
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are
 *  met:
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above copyright
 *      notice, this list of conditions and the following disclaimer in the
 *      documentation and/or other materials provided with the distribution.
 *    * Neither the name of the Universite de Montreal nor the names of its
 *      contributors may be used to endorse or promote products derived
 *      from this software without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 *  IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 *  TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 *  PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL UNIVERSITE DE
 *  MONTREAL BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 *  PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 *  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 *  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * _________________________________________________________________________
 */

/**
@fileOverview
Implementation of type descriptors for the type analysis.

@author
Maxime Chevalier-Boisvert
*/

/*
Variable nodes for all SSA temps
Variable nodes for object fields

Singleton value nodes for constants

Singleton value nodes for objects
- Can have multiple instances for one creation site

What about objects?
- Can't be unique nodes because they can have different properties?
- Could have node for object with sub-nodes for the fields?
  - The object field is a variable***
  - Variables point to possible values***

Compression idea****
- Could reuse whole edge sets for variable nodes
- Copy outgoing edge sets on modification
- Store only changed edge sets?
- Could eventually have singleton edge sets

Compression observations:
1. Most nodes are variables. Most only need one edge set through their entire lifetime.
- Nodes that only have one possible edge set need only be encoded in one location, never copied?
*/

/**
@class Represents a variable or object property in type graph.
*/
function TGVariable(name, parent)
{
    this.name = name;

    this.parent = parent;
}

/**
Produce a string representation of this variable
*/
TGVariable.prototype.toString = function ()
{
    return this.name;
}

/**
@class Object value in a type graph.
*/
function TGObject(origin, flags)
{
    assert (
        flags === TypeFlags.OBJECT  ||
        flags === TypeFlags.ARRAY   ||
        flags === TypeFlags.FUNCTION,
        'invalid type flags for object'
    );

    /**
    Origin (creation) site of the object.
    */
    this.origin = origin;

    // TODO: creation context

    // If the object is already in the map, return it
    var obj = TGObject.objMap.get(this);
    if (obj !== HashMap.NOT_FOUND)
        return obj;

    /**
    Type flags for this object
    */
    this.flags = flags;

    /**
    Prototype of this object
    */
    this.proto = new TGVariable('proto', this);

    /**
    Map of property names to corresponding variable nodes
    */
    this.props = {};

    // Add the object to the map
    TGObject.objMap.set(this, this);
}

/**
Map of existing objects
*/
TGObject.objMap = new HashMap(
    function hash(o)
    {
        return defHashFunc(o.origin);
    },
    function eq(o1, o2)
    {
        if (o1.origin !== o2.origin)
            return false;

        return true;
    }
);

/**
Produce a string representation of this object
*/
TGObject.prototype.toString = function ()
{
    var str = '<';

    if (typeof this.origin === 'string')
        str += this.origin;
    else if (this.origin instanceof IRFunction)
        str += 'func:"' + this.origin.funcName + '"';
    else
        str += this.origin.getValName();

    str += '>';

    return str;
}

/**
Get the value node for a given property
*/
TGObject.prototype.getPropNode = function (name)
{
    // If the property doesn't exist, create it
    if (this.props[name] === undefined)
        this.props[name] = new TGVariable(name, this);

    return this.props[name];
}

/**
Test if this object is a singleton instance
*/
TGObject.prototype.isSingleton = function ()
{
    return (typeof this.origin === 'string');
}

/**
@namespace Type descriptor flags namespace
*/
TypeFlags = {};

// Possible type descriptor flags
TypeFlags.UNDEF    = 1 << 0; // May be undefined
TypeFlags.NULL     = 1 << 1; // May be null
TypeFlags.TRUE     = 1 << 2; // May be true
TypeFlags.FALSE    = 1 << 3; // May be false
TypeFlags.FLOAT    = 1 << 4; // May be floating-point
TypeFlags.INT      = 1 << 5; // May be integer
TypeFlags.STRING   = 1 << 6; // May be string
TypeFlags.OBJECT   = 1 << 7; // May be string
TypeFlags.ARRAY    = 1 << 8; // May be string
TypeFlags.FUNCTION = 1 << 9; // May be string

// Extended object (object or array or function)
TypeFlags.OBJEXT =
    TypeFlags.OBJECT    |
    TypeFlags.ARRAY     |
    TypeFlags.FUNCTION;

// Unknown/any type flag
TypeFlags.ANY =
    TypeFlags.UNDEF    |
    TypeFlags.NULL     |
    TypeFlags.TRUE     |
    TypeFlags.FALSE    |
    TypeFlags.INT      |
    TypeFlags.FLOAT    |
    TypeFlags.STRING   |
    TypeFlags.OBJECT   |
    TypeFlags.ARRAY    |
    TypeFlags.FUNCTION;

// Empty/uninferred type flag (before analysis)
TypeFlags.EMPTY = 0;

/**
@class Set of value nodes representing possible variable types
*/
function TypeSet(
    flags,
    rangeMin,
    rangeMax,
    strVal,
    objSet
)
{
    // Empty type descriptors have the uninferred type
    if (flags === undefined)
        flags = TypeFlags.EMPTY;

    // By default, the numerical ranges are unbounded.
    // Otherwise, restrict them to a fixed integer range
    if (rangeMin === undefined)
        rangeMin = -Infinity;
    else if (rangeMin < TypeSet.MIN_NUM_RANGE)
        rangeMin = -Infinity;
    if (rangeMax === undefined)
        rangeMax = Infinity;
    else if (rangeMax > TypeSet.MAX_NUM_RANGE)
        rangeMax = Infinity;

    // Limit the string length to force convergence
    if (strVal !== undefined && strVal.length > TypeSet.MAX_STR_LEN)
        strVal = undefined;

    assert (
        objSet === undefined ||
        objSet instanceof HashSet
    );

    /**
    Type flags
    */
    this.flags = flags;

    /**
    Object set
    */
    this.objSet = objSet;

    /**
    Numerical range minimum
    */
    this.rangeMin = rangeMin;

    /**
    Numerical range maximum
    */
    this.rangeMax = rangeMax;

    /**
    String value
    */
    this.strVal = strVal;
}

/**
Generate a type set for a constant value
*/
TypeSet.constant = function (value)
{
    if (value instanceof IRConst)
        value = value.value;

    if (value === undefined)
    {
        return new TypeSet(TypeFlags.UNDEF);
    }

    else if (value === null)
    {
        return new TypeSet(TypeFlags.NULL);
    }

    else if (value === true)
    {
        return new TypeSet(TypeFlags.TRUE);
    }

    else if (value === false)
    {
        return new TypeSet(TypeFlags.FALSE);
    }

    else if (isInt(value) === true)
    {
        return new TypeSet(TypeFlags.INT, value, value);
    }

    else if (typeof value === 'number')
    {
        return new TypeSet(TypeFlags.FLOAT, value, value);
    }

    else if (typeof value === 'string')
    {
        return new TypeSet(TypeFlags.STRING, undefined, undefined, value);
    }

    // By default, return the unknown type
    return TypeSet.any;
}

/**
Produce a string representation of this type set
*/
TypeSet.prototype.toString = function ()
{
    if (this.flags === TypeFlags.EMPTY)
        return '{}';

    if (this.flags === TypeFlags.ANY)
        return '{any}';

    var str = '{';

    function addType(tstr)
    {
        if (str !== '{')
            str += ','

        str += tstr;
    }

    if (this.flags & TypeFlags.UNDEF)
        addType('undef');
    if (this.flags & TypeFlags.NULL)
        addType('null');
    if (this.flags & TypeFlags.TRUE)
        addType('true');
    if (this.flags & TypeFlags.FALSE)
        addType('false');

    // If the set includes numbers
    if (this.flags & TypeFlags.INT || this.flags & TypeFlags.FLOAT)
    {
        var numStr = ((this.flags & TypeFlags.FLOAT)? 'fp':'int') + ':';

        if (this.rangeMin === this.rangeMax)
            numStr += this.rangeMin;
        else if (this.rangeMin !== -Infinity && this.rangeMax !== Infinity)
            numStr += "[" + this.rangeMin + ", " + this.rangeMax + "]";
        else if (this.rangeMin === -Infinity)
            numStr += "]-inf, " + this.rangeMax + "]";
        else
            numStr += "[" + this.rangeMin + ", +inf[";

        addType(numStr);
    }

    // If a string constant is defined
    if (this.flags & TypeFlags.STRING)
    {
        addType(
            'string' + 
            ((this.strVal !== undefined)? (':"' + this.strVal + '"'):'')
        );
    }

    // If the object set is empty
    if (this.objSet === undefined || this.objSet.length === 0)
    {
        if (this.flags & TypeFlags.OBJECT)
            addType('object');
        if (this.flags & TypeFlags.ARRAY)
            addType('array');
        if (this.flags & TypeFlags.FUNCTION)
            addType('function');
    }
    else
    {
        // For each possible object
        for (var itr = this.objSet.getItr(); itr.valid(); itr.next())
        {
            var obj = itr.get();
            addType(obj.toString());
        }
    }

    str += "}";

    return str;
}

/**
Type set equality test
*/
TypeSet.prototype.equal = function (that)
{
    if (this === that)
        return true;

    if (this.flags !== that.flags)
        return false;

    if (this.rangeMin !== that.rangeMin ||
        this.rangeMax !== that.rangeMax)
        return false;

    if (this.strVal !== that.strVal)
        return false;

    if (this.objSet === undefined && that.objSet !== undefined ||
        that.objSet === undefined && this.objSet !== undefined ||        
        this.objSet !== undefined && this.objSet.equal(that.objSet) === false)
        return false;

    return true;
}

/**
Type set union function
*/
TypeSet.prototype.union = function (that)
{
    // If the other object is the uninferred type
    if (that.flags === TypeFlags.EMPTY)
    {
        return this;
    }

    // If this object is the uninferred type
    else if (this.flags === TypeFlags.EMPTY)
    {
        return that;
    }

    // If both type sets are the any set
    else if (this.flags === TypeFlags.ANY || that.flags === TypeFlags.ANY)
    {
        return TypeSet.any;
    }

    // If both type descriptors are the same, return this one
    else if (this === that)
    {
        return this;
    }

    // If both objects have meaningful type values
    else
    {
        var flags = this.flags | that.flags;

        // Merge the min range value
        var rangeMin;
        if (this.rangeMin === that.rangeMin)
        {
            rangeMin = this.rangeMin;
        }
        else if (this.rangeMin === -Infinity || that.rangeMin === -Infinity)
        {
            rangeMin = -Infinity;   
        }
        else if (this.rangeMin < 0 || that.rangeMin < 0)
        {
            var minMin = Math.abs(Math.min(this.rangeMin, that.rangeMin));
            
            if (isPowerOf2(minMin) === true)
                rangeMin = -minMin;
            else
                rangeMin = -nextPowerOf2(minMin);
        }
        else
        {
            rangeMin = Math.min(this.rangeMin, that.rangeMin);
            rangeMin = lowestBit(rangeMin);
        }
        assert (
            rangeMin <= this.rangeMin && rangeMin <= that.rangeMin,
            'invalid min value'
        );

        // Merge the max range value
        var rangeMax;
        if (this.rangeMax === that.rangeMax)
        {
            rangeMax = this.rangeMax;
        }
        else if (this.rangeMax === Infinity || that.rangeMax === Infinity)
        {
            rangeMax = Infinity;   
        }
        else if (this.rangeMax > 0 || that.rangeMax > 0)
        {
            var maxMax = Math.max(this.rangeMax, that.rangeMax);
            
            if (isPowerOf2(maxMax) === true)
                rangeMax = maxMax;
            else
                rangeMax = nextPowerOf2(maxMax);
        }
        else
        {
            rangeMax = Math.max(this.rangeMax, that.rangeMax);
            rangeMax = -lowestBit(Math.abs(rangeMax));
        }
        assert (
            rangeMax >= this.rangeMax && rangeMax >= that.rangeMax,
            'invalid max value'
        );

        var strVal =
            (this.strVal === that.strVal)?
            this.strVal:undefined;

        // Compute the union of the object sets
        var objSet;
        if (this.objSet === undefined && that.objSet === undefined)
            objSet = undefined;
        else if (this.objSet === undefined)
            objSet = that.objSet.copy();
        else if (that.objSet === undefined)
            objSet = this.objSet.copy();
        else
            objSet = this.objSet.copy().union(that.objSet);

        // Create and return a new type descriptor and return it
        return new TypeSet(
            flags,
            rangeMin,
            rangeMax,
            strVal,
            objSet
        );
    }
}

/**
Restrict a type set based on possible type flags
*/
TypeSet.prototype.restrict = function (flags)
{
    var flags = this.flags & flags;

    // If the flags are unchanged, return this descriptor
    if (flags === this.flags)
        return this;

    // Test whether the new type can be a number, string, function or object
    var canBeNum  = (flags & (TypeFlags.INT | TypeFlags.FLOAT)) !== 0;
    var canBeStr  = (flags & TypeFlags.STRING) !== 0;
    var canBeFunc = (flags & TypeFlags.FUNCTION) !== 0;
    var canBeObj  = (flags & (TypeFlags.OBJECT | TypeFlags.ARRAY)) !== 0;

    // If the new value can't be a number, remove the range info
    if (canBeNum === true)
    {
        var rangeMin = this.rangeMin;
        var rangeMax = this.rangeMax;
    }
    else
    {
        var rangeMin = -Infinity;
        var rangeMax = Infinity;
    }

    var strVal = (canBeStr === true)? this.strVal:undefined;

    // If the type can be either a function or an object
    if (canBeFunc === true && canBeObj === true)
    {
        // Leave the object set unchanged
        var objSet = this.objSet.copy();
    }
    else
    {
        var objSet = new HashSet();

        // For each item in the object set
        for (var itr = this.objSet.getItr(); itr.valid(); itr.next())
        {
            var obj = itr.get()

            // If the flags don't match, skip this object
            if ((obj.flags & flags) === 0)
                continue;

            objSet.add(obj);
        }
    }

    // Create and return a new type set and return it
    return new TypeSet(
        flags,
        rangeMin,
        rangeMax,
        strVal,
        objSet
    );
}

/**
Get an iterator to the object set
*/
TypeSet.prototype.getObjItr = function ()
{
    assert (
        this !== TypeSet.any,
        'cannot get object iterator of any set'
    );

    if (this.objSet === undefined)
    {
        return {
            valid: function () { return false; }
        };
    }

    return this.objSet.getItr();
}

/**
Minimum numerical range value inferred
*/
TypeSet.MIN_NUM_RANGE = getIntMin(16);

/**
Maximum numerical range value inferred
*/
TypeSet.MAX_NUM_RANGE = getIntMax(16);

/**
Max string length usable string values
*/
TypeSet.MAX_STR_LEN = 256;

/**
Empty/uninferred type set (bottom element)
*/
TypeSet.empty = new TypeSet(TypeFlags.EMPTY);

/**
Unknown/any type set (top element)
*/
TypeSet.any = new TypeSet(TypeFlags.ANY);

/**
Undefined type descriptor
*/
TypeSet.undef = new TypeSet(TypeFlags.UNDEF);

/**
Null type descriptor
*/
TypeSet.null = new TypeSet(TypeFlags.NULL);

/**
True type descriptor
*/
TypeSet.true = new TypeSet(TypeFlags.TRUE);

/**
False type descriptor
*/
TypeSet.false = new TypeSet(TypeFlags.FALSE);

/**
Boolean type descriptor
*/
TypeSet.bool = new TypeSet(TypeFlags.TRUE | TypeFlags.FALSE);

/**
String type descriptor
*/
TypeSet.string = new TypeSet(TypeFlags.STRING);

/**
@class Type graph. Contains edges between nodes and values
*/
function TypeGraph()
{
    /**
    Map of variables nodes to type sets
    */
    this.varMap = new HashMap();
}

/**
Set the possible types for a variable node
*/
TypeGraph.prototype.assignTypes = function (varNode, typeSet)
{
    assert (
        varNode instanceof TGVariable ||
        varNode instanceof IRInstr,
        'invalid var node'
    );

    assert (
        typeSet instanceof TypeSet,
        'invalid type set'
    );

    this.varMap.set(varNode, typeSet);
}

/**
Union the types of a variable with another type set
*/
TypeGraph.prototype.unionTypes = function (varNode, typeSet)
{
    assert (
        varNode instanceof TGVariable ||
        varNode instanceof IRInstr,
        'invalid var node'
    );

    assert (
        typeSet instanceof TypeSet,
        'invalid type set: ' + typeSet
    );

    var curSet = this.varMap.get(varNode)

    if (curSet === HashMap.NOT_FOUND)
        var curSet = new TypeSet();

    var unionSet = curSet.union(typeSet);

    assert (
        unionSet instanceof TypeSet,
        'invalid union set'
    );

    this.varMap.set(varNode, unionSet);
}

/**
Remove a variable node from the graph
*/
TypeGraph.prototype.remVar = function (varNode)
{
    assert (
        varNode instanceof TGVariable ||
        varNode instanceof IRInstr,
        'invalid var node'
    );

    this.varMap.rem(varNode);
}

/**
Copy a graph instance
*/
TypeGraph.prototype.copy = function ()
{
    var newGraph = new TypeGraph();

    for (var nodeItr = this.varMap.getItr(); nodeItr.valid(); nodeItr.next())
    {
        var pair = nodeItr.get();
        var node = pair.key;
        var typeSet = pair.value;

        newGraph.assignTypes(node, typeSet);
    } 

    return newGraph;
}

/**
Merge another graph into this one.
*/
TypeGraph.prototype.merge = function (other)
{
    var newGraph = this.copy();

    for (nodeItr = other.varMap.getItr(); nodeItr.valid(); nodeItr.next())
    {
        var edge = nodeItr.get();
        var node = edge.key;
        var typeSet = edge.value;

        var localSet = this.varMap.get(node);

        if (localSet === HashMap.NOT_FOUND)
        {
            var unionSet = typeSet;
        }
        else
        {
            var unionSet = localSet.union(typeSet);
        }

        newGraph.varMap.set(node, unionSet);
    }

    return newGraph;
}

/**
Compare this graph for equality with another.
Equality means both graphs have the same edges.
*/
TypeGraph.prototype.equal = function (other)
{
    if (this.varMap.numItems !== other.varMap.numItems)
        return false;

    for (nodeItr = other.varMap.getItr(); nodeItr.valid(); nodeItr.next())
    {
        var edge = nodeItr.get();

        var node = edge.key;
        var typeSet = edge.value;

        var localSet = this.varMap.get(node);

        if (localSet === HashMap.NOT_FOUND && typeSet !== TypeSet.emptySet)
            return false;
        else if (localSet.equal(typeSet) === false)
            return false;
    }

    return true;
}

/**
Create a new object in the type graph
*/
TypeGraph.prototype.newObject = function (origin, protoSet, flags)
{
    // By default, the prototype is null
    if (protoSet === undefined)
        protoSet = TypeSet.undef;

    // By default, this is a regular object
    if (flags === undefined)
        flags = TypeFlags.OBJECT;

    var obj = new TGObject(origin, flags);

    this.assignTypes(obj.proto, protoSet);

    var objSet = new HashSet();
    objSet.add(obj);

    return new TypeSet(
        flags, 
        undefined, 
        undefined, 
        undefined, 
        objSet
    );
}

/**
Get the set of value nodes for an IR value
*/
TypeGraph.prototype.getTypeSet = function (value)
{
    // If this is a variable node or IR instruction
    if (value instanceof TGVariable ||
        value instanceof IRInstr)
    {
        var typeSet = this.varMap.get(value);
        if (typeSet !== HashMap.NOT_FOUND)
            return typeSet;
 
        return TypeSet.empty;
    }

    // If this is a constant
    else
    {
        assert (
            value instanceof IRConst,
            'invalid value'
        );

        // Create a type set for the constant
        return TypeSet.constant(value);
    }
}


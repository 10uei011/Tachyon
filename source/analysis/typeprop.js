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
Interprocedural type analysis implementation.

@author
Maxime Chevalier-Boisvert
*/

//=============================================================================
//
// Type propagation analysis core
//
//=============================================================================

/**
@class Type propagation interprocedural analysis
*/
function TypeProp(params)
{
    assert (
        params instanceof CompParams,
        'expected compilation parameters'
    );

    /**
    Compilation parameters this analysis is associated with
    */
    this.params = params;

    // Initialize the type analysis
    this.init();
}

/**
Initialize/reset the analysis
*/
TypeProp.prototype.init = function ()
{
    /**
    Worklist of basic blocks queued to be analyzed
    */
    this.workList = new LinkedList();

    /**
    Set of blocks in the work list
    This is to avoid adding blocks to the work list twice
    */
    this.workSet = new HashSet();

    /**
    Map of type graphs at block entries
    */
    this.blockGraphs = new HashMap();

    /**
    Initial type graph
    */
    this.initGraph = new TypeGraph();

    /**
    Object prototype object node
    */
    this.objProto = this.initGraph.newObject('obj_proto');

    /**
    Array prototype object node
    */
    this.arrProto = this.initGraph.newObject('arr_proto');

    /**
    Function prototype object node
    */
    this.funcProto = this.initGraph.newObject('func_proto');

    /**
    Global object node
    */
    this.globalObj = this.initGraph.newObject('global', this.objProto);

    /**
    Map of IR functions to function-specific information
    */
    this.funcInfo = new HashMap();

    /**
    Ordered list of unit-level functions to be analyzed
    */
    this.unitList = [];

    /**
    Total analysis iteration count
    */
    this.itrCount = 0;
}

/**
Get the function info object for an IR function
*/
TypeProp.prototype.getFuncInfo = function (irFunc)
{
    // TODO
    /* 
    Need type graph at entry block.

    Need to have variable nodes for the arguments.****
    - argNodes
    - Used by ArgValInstr

    Also need type graph at returns. These are merged.
  
    Need to have variable node for the return value.***

    When a call is processed... Need to copy edges from arguments
    to the argument nodes of the entry graph.
    */

    // If an info object already exists, return it
    var info = this.funcInfo.get(irFunc);
    if (info !== HashMap.NOT_FOUND)
        return info;

    // Create the entry type graph
    var entryGraph = new TypeGraph();

    // Create the return type graph
    var retGraph = new TypeGraph();

    // Create nodes for the argument values
    var argNodes = new Array(irFunc.argVars.length + 2);
    for (var i = 0; i < argNodes.length; ++i)
        argNodes[i] = new TGVariable('arg' + i);

    // Return value node
    var retNode = new TGVariable('ret');

    // Create a new info object
    var info = {

        // Function entry block
        entry: irFunc.hirCFG.entry,

        // Type graph at the entry
        entryGraph: entryGraph,

        // Type graph at return points
        retGraph: retGraph,

        // Argument value nodes
        argNodes: argNodes,

        // Return value node
        retNode: retNode,

        // Set of caller blocks
        callerSet: new HashSet(),

        // List of callers
        callerList: [],

        // Next unit in the chain, for unit-level functions
        nextUnit: undefined
    };

    // Store the new function info object
    this.funcInfo.set(irFunc, info);

    return info;
}

/**
Queue a block to be (re)analyzed
*/
TypeProp.prototype.queueBlock = function (block)
{
    // If the block is already queued, do nothing
    if (this.workSet.has(block) === true)
        return;

    this.workList.addLast(block);

    this.workSet.add(block);
}

/**
Queue a function to be analyzed
*/
TypeProp.prototype.queueFunc = function (irFunc)
{
    assert (
        irFunc instanceof IRFunction,
        'expected IR function'
    );

    // Get the function's entry block
    var entry = irFunc.hirCFG.entry;

    // If the function has no entry type info
    if (this.blockGraphs.has(entry) === false)
    {
        // Get the info object for this function
        var funcInfo = this.getFuncInfo(irFunc);

        // Set the type graph for the entry block
        this.blockGraphs.set(entry, funcInfo.entryGraph);
    }

    // Queue the function's entry block
    this.queueBlock(entry);
}

/**
Queue a unit-level function to be analyzed
*/
TypeProp.prototype.queueUnit = function (ir)
{
    assert (
        ir.astNode instanceof Program,
        'IR object is not unit-level function'
    );

    // TODO: prev/next unit?

    // Get the info object for this function
    var funcInfo = this.getFuncInfo(ir);

    // Queue the unit function to be analyzed
    this.queueFunc(ir);

    // Add the unit to the list of units to be analyzed
    this.unitList.push(ir);

    // TODO: handle next unit
}

/**
Run the analysis for some number of iterations
*/
TypeProp.prototype.run = function (maxItrs)
{
    // Until the max iteration count is reached
    for (var numItrs = 0; maxItrs === undefined || numItrs < maxItrs; ++numItrs)
    {
        // If the work list is empty, stop
        if (this.workList.isEmpty() === true)
            break;

        // Run one analysis iteration
        this.iterate();
    }

    // Update the total iteration count
    this.itrCount += numItrs;

    // Return the number of iterations performed
    return numItrs;
}

/**
Run one type analysis iteration
*/
TypeProp.prototype.iterate = function ()
{
    assert (
        this.workList.isEmpty() === false,
            'empty work list'
    );

    // Remove a block from the work list
    var block = this.workList.remFirst();
    this.workSet.rem(block);

    print('------')
    print('Block: ' + block.getBlockName());
    print('------')
    print('');

    // Get a copy of the type set at the block entry
    var typeGraph = this.blockGraphs.get(block).copy();

    assert (
        typeGraph !== HashMap.NOT_FOUND,
        'type graph not found'
    );

    // For each instruction
    for (var i = 0; i < block.instrs.length; ++i)
    {
        var instr = block.instrs[i];

        // Process the instruction
        instr.typeProp(this, typeGraph);

        print(instr);

        /*
        // For each use of the instruction
        for (var j = 0; j < instr.uses.length; ++j)
        {
            var use = instr.uses[j];

            var useType = typeMap.getType(use);

            assert (
                useType instanceof TypeDesc || useType === HashMap.NOT_FOUND,
                'invalid use type'
            );

            print(use.getValName() + ' : ' + useType);

            // If this is an IR instruction and this is its only use,
            // remove it from the type map
            if (use instanceof IRInstr && use.dests.length === 1)
                typeMap.rem(use);
        }
        */

        if (instr.dests.length > 0)
            print(instr.getValName() + ' => ' + typeGraph.getTypeSet(instr));
        print('');




        // TODO: assert output set if instruction has dests?
        /* 
        assert (
            instr.dests.length === 0 ||
            outType instanceof TypeDesc,
            'instruction flow function returned invalid type descriptor'
        );
        */


        // TODO: implement this using an exception?
        /*
        // If the output is uninferred, stop analyzing this block for now,
        // wait until better information is available
        if (outType === TypeDesc.noinf)
        {
            print('noinf output, stopping block analysis');
            print('');
            return;
        }
        */


    }
}

/**
Merge incoming types for a successor block
*/
TypeProp.prototype.succMerge = function (succ, predMap)
{







    // TODO
    /*
    // Get the type map for the successor
    var succMap = this.blockGraphs.get(succ);

    // If the successor has no type map yet
    if (succMap === HashMap.NOT_FOUND)
    {
        // Pass a copy of the predecessor map to the successor
        this.blockGraphs.set(succ, predMap.copy());

        // Queue the successor for analysis
        this.queueBlock(succ);
    }
    else
    {
        // Merge the predecessor type map into the successor's
        var changed = succMap.merge(predMap);

        // If the successor's type map was changed,
        // queue the successor for analysis
        if (changed == true)
            this.queueBlock(succ);
    }
    */
}

//=============================================================================
//
// Flow functions for HIR instructions
//
//=============================================================================

IRInstr.prototype.typeProp = function (ta, typeGraph)
{
    // By default, return the any type
    typeGraph.unionTypes(this, TypeSet.anySet);
}

PhiInstr.prototype.typeProp = function (ta, typeGraph)
{
    // TODO
    /*
    var outType = TypeDesc.noinf;
    */

    // For each phi predecessor
    for (var i = 0; i < this.preds.length; ++i)
    {
        var pred = this.preds[i];

        // TODO
        /*
        // If this predecessor hasn't been visited, skip it
        if (ta.blockGraphs.has(pred) === false)
            continue;

        // Merge the type of this incoming value
        var incType = typeMap.getType(this.uses[i]);
        outType = outType.union(incType);
        */
    }

    /*
    assert (
        outType !== TypeDesc.noinf,
        'phi output type is noinf'
    );

    typeMap.setType(this, outType);

    return outType;
    */
}

GlobalObjInstr.prototype.typeProp = function (ta, typeGraph)
{
    // This refers to the global object
    typeGraph.unionTypes(this, ta.globalObj);
}

InitGlobalInstr.prototype.typeProp = function (ta, typeGraph)
{
    var propName = this.uses[1].value;

    var propNode = ta.globalObj.getPropNode(propName);

    typeGraph.unionTypes(propNode, TypeSet.undefSet);
}

BlankObjInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Create a new object from the object prototype
    var newObj = typeGraph.newObject(this, ta.objProto);

    // The result is the new object
    typeGraph.unionTypes(this, newObj);
}

BlankArrayInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Create a new array object from the array prototype
    var newObj = typeGraph.newObject(this, ta.arrProto);

    // The result is the new object
    typeGraph.unionTypes(this, newObj);
}

HasPropInstr.prototype.typeProp = function (ta, typeGraph)
{
    typeGraph.unionTypes(this, TypeSet.boolSet);
}

PutPropInstr.prototype.typeProp = function (ta, typeGraph)
{
    var objSet = typeGraph.getTypeSet(this.uses[0]);
    var nameSet = typeGraph.getTypeSet(this.uses[1]);
    var valSet = typeGraph.getTypeSet(this.uses[2]);

    // For each possible object
    for (objItr = objSet.getItr(); objItr.valid(); objItr.next())
    {
        var obj = objItr.get();

        // If this is not an object
        if ((obj instanceof TGObject) === false)
        {
            print('*WARNING: putProp on non-object');

            typeGraph.unionTypes(this, TypeSet.valSet);

            return;
        }

        // For each possible name
        for (nameItr = nameSet.getItr(); nameItr.valid(); nameItr.next())
        {
            var name = nameItr.get();

            // If this is not a string constant
            if ((name instanceof TGConst) === false ||
                typeof name.value.value !== 'string')
            {
                print('*WARNING: putProp with unknown property name');

                typeGraph.unionTypes(this, TypeSet.valSet);

                return;
            }

            var propName = name.value.value;

            // Get the node for this property
            var propNode = obj.getPropNode(propName);

            // Assign the value type set to the property
            if (obj.isSingleton === true)
                typeGraph.assignTypes(propNode, valSet);
            else
                typeGraph.unionTypes(propNode, valSet);
        }
    }

    typeGraph.unionTypes(this, valSet);
}

GetPropInstr.prototype.typeProp = function (ta, typeGraph)
{
    var outSet = new TypeSet();

    var objSet = typeGraph.getTypeSet(this.uses[0]);
    var nameSet = typeGraph.getTypeSet(this.uses[1]);

    // For each possible object
    for (objItr = objSet.getItr(); objItr.valid(); objItr.next())
    {
        var obj = objItr.get();

        // If this is not an object
        if ((obj instanceof TGObject) === false)
        {
            print('*WARNING: getProp on non-object');

            typeGraph.unionTypes(this, TypeSet.anySet);

            return;
        }

        // For each possible name
        for (nameItr = nameSet.getItr(); nameItr.valid(); nameItr.next())
        {
            var name = nameItr.get();

            // If this is not a string constant
            if ((name instanceof TGConst) === false ||
                typeof name.value.value !== 'string')
            {
                print('*WARNING: getProp with unknown property name');

                typeGraph.unionTypes(this, TypeSet.anySet);

                return;
            }

            var propName = name.value.value;

            // Get the node for this property
            var propNode = obj.getPropNode(propName);

            // Union the types for this property into the type set
            outSet.union(typeGraph.getTypeSet(propNode));
        }
    }

    typeGraph.unionTypes(this, outSet);
}

GetGlobalInstr.prototype.typeProp = GetPropInstr.prototype.typeProp;




/*
FIXME: issue, if any set is a special value, cannot do union modifying type set...
Ideally, should create a new type set, this also allows for a future extension with
a different implementation...

Probably want to rework type set implementation**** Don't derive from hash set directly.
*/




/*
FIXME: issue, how do we handle integer ranges? Special provision in type sets for range?

Special rangeMin, rangeMax values?
- Need to indicate if can be int or float

*** Special handling on typeSet.add, typeSet.union, typeSet.has

ISSUE: can't just iterate over values! Set of one element can also contain
an infinite number of number values!
- putProp, getProp need to test typeSet.hasInt()? typeSet.hasFloat()?
- Fortunately, not many instructions need to iterate over all possible values


TODO: simplify things, handle all number values this way****
- Avoid complexity in analysis of operations that do arithmetic



TODO: implement call first
- Function closure creation handling, makeClos


*/









/*
JSAddInstr.prototype.typeProp = function (ta, typeGraph)
{
    var t0 = typeMap.getType(this.uses[0]);
    var t1 = typeMap.getType(this.uses[1]);

    // Output type
    var outType;

    if (t0.flags === TypeFlags.INT && t1.flags === TypeFlags.INT)
    {
        var minVal = t0.minVal + t1.minVal;

        var maxVal = t0.maxVal + t1.maxVal;

        outType = new TypeDesc(
            TypeFlags.INT,
            minVal,
            maxVal
        );
    }

    else if (t0.flags === TypeFlags.STRING || t1.flags === TypeFlags.STRING)
    {
        var t0Str = t0.stringVal();
        var t1Str = t1.stringVal();

        var newStr = (t0Str && t1Str)? (t0Str + t1Str):undefined;

        outType = new TypeDesc(
            TypeFlags.STRING,
            undefined,
            undefined,
            newStr
        );
    }

    else if ((t0.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0 &&
        (t1.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0)
    {
        outType = new TypeDesc(TypeFlags.INT | TypeFlags.STRING)
    }

    // By default
    else
    {
        outType = new TypeDesc(TypeFlags.INT | TypeFlags.FLOAT | TypeFlags.STRING);
    }

    return ta.setOutput(typeMap, this, outType);
}
*/

/*
JSSubInstr.prototype.typeProp = function (ta, typeGraph)
{
    var t0 = typeMap.getType(this.uses[0]);
    var t1 = typeMap.getType(this.uses[1]);

    // Output type
    var outType;

    if (t0.flags === TypeFlags.INT && t1.flags === TypeFlags.INT)
    {
        var minVal = t0.minVal - t1.maxVal;

        var maxVal = t0.maxVal - t1.minVal;

        outType = new TypeDesc(
            TypeFlags.INT,
            minVal,
            maxVal
        );
    }

    else if ((t0.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0 &&
             (t1.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0)
    {
        outType = new TypeDesc(TypeFlags.INT)
    }

    // By default
    else
    {
        outType = new TypeDesc(TypeFlags.INT | TypeFlags.FLOAT);
    }

    return ta.setOutput(typeMap, this, outType);
}
*/

/*
JSLtInstr.prototype.typeProp = function (ta, typeGraph)
{
    var v0 = typeMap.getType(this.uses[0]);
    var v1 = typeMap.getType(this.uses[1]);

    // TODO: int range handling

    // TODO:
    return ta.setOutput(typeMap, this, TypeDesc.bool);
}
*/

/*
JSEqInstr.prototype.typeProp = function (ta, typeGraph)
{
    var v0 = typeMap.getType(this.uses[0]);
    var v1 = typeMap.getType(this.uses[1]);

    // Output type
    var outType;

    // If both values are known integer constants
    if (v0.flags === TypeFlags.INT &&
        v1.flags === TypeFlags.INT &&
        v0.minVal === v0.maxVal &&
        v1.minVal === v1.maxVal)
    {
        outType = (v0.minVal === v1.minVal)? TypeDesc.true:TypeDesc.false;
    }

    // If both values are known booleans
    else if ((v0.flags === TypeFlags.TRUE || v0.flags === TypeFlags.FALSE) &&
             (v1.flags === TypeFlags.TRUE || v1.flags === TypeFlags.FALSE))
    {
        outType = (v0.flags === v1.flags)? TypeDesc.true:TypeDesc.false;
    }

    // Otherwise, we know the output is boolean
    else
    {
        outType = TypeDesc.bool;
    }

    return ta.setOutput(typeMap, this, outType);
}
*/

/*
JSNsInstr.prototype.typeProp = function (ta, typeGraph)
{
    // TODO:
    //return ta.setOutput(typeMap, this, TypeDesc.bool);
}
*/

/*
JSCallInstr.prototype.typeProp = function (ta, typeGraph)
{
    var callee = typeMap.getType(this.uses[0]);
    var thisArg = typeMap.getType(this.uses[1]);

    // Function return type
    var retType = TypeDesc.noinf;

    // For each potential callee
    for (var i = 0; i < callee.mapSet.length; ++i)
    {
        // Get this class descriptor
        var classDesc = callee.mapSet[i].classDesc;

        // Get the function for this class
        var func = classDesc.origin;

        // If this is not a function, ignore it
        if ((func instanceof IRFunction) === false)
            continue;

        //print('potential callee: ' + func.funcName);

        // Get the info object for this function
        var funcInfo = ta.getFuncInfo(func);

        // Argument types changed flag
        var argChanged = false;

        // For each argument
        for (var j = 0; j < funcInfo.argTypes.length; ++j)
        {
            // Get the incoming type for this argument
            var argType = 
                (j < this.uses.length)?
                typeMap.getType(this.uses[j]):
                TypeDesc.undef;

            // Merge the argument type
            var newType = argType.union(funcInfo.argTypes[j]);
            if (newType.equal(funcInfo.argTypes[j]) === false)
            {
                //print('arg type changed');
                //print('old type: ' + funcInfo.argTypes[j]);
                //print('new type: ' + newType);

                funcInfo.argTypes[j] = newType;
                argChanged = true;
            }
        }

        // Get the global type from the type map
        var globalType = typeMap.getGlobalType();

        // Merge the function's global type
        var newGlobal = funcInfo.globalType.union(globalType);
        if (newGlobal.equal(funcInfo.globalType) === false)
        {
            //print('global type changed');

            funcInfo.globalType = newGlobal;
            argChanged = true;
        }

        // If any argument types changed, queue the function for analysis
        if (argChanged === true)
            ta.queueFunc(func);

        // Add this instruction to the set of callers
        if (funcInfo.callerSet.has(this) === false)
        {
            funcInfo.callerSet.add(this);
            funcInfo.callerList.push(this);
        }
       
        // Merge the return type
        retType = retType.union(funcInfo.retType);
    }

    // Set our own output type in the type map
    if (this.dests.length > 0)
        typeMap.setType(this, retType);

    // Merge with all possible branch targets
    for (var i = 0; i < this.targets.length; ++i)
        ta.succMerge(this.targets[i], typeMap);

    // Restrict the function type along the normal path
    var newFuncType = callee.restrict(TypeFlags.FUNCTION);
    ta.setInput(typeMap, this, this.uses[0], newFuncType, callee);

    // Return the function return type
    return ta.setOutput(typeMap, this, retType);
}
*/

// LIR call instruction
CallFuncInstr.prototype.typeProp = function (ta, typeGraph)
{
    var callee = this.uses[0];

    // Return type
    var retType;

    // If we cannot determine the callee
    if ((callee instanceof IRFunction) === false)
    {
        // Do nothing
        retType = TypeSet.anySet;
    }

    // If this is a call to makeClos (closure creation)
    else if (callee.funcName === 'makeClos')
    {
        var func = this.uses[3];

        assert (
            func instanceof IRFunction,
            'closure of unknown function'
        );

        // Create an object node for this function
        var funcObj = typeGraph.newObject(func, ta.funcProto);

        retType = funcObj;
    }

    // For other primitive functions
    else
    {
        // Do nothing
        retType = TypeSet.anySet;
    }

    // Set our own output type in the type graph
    typeGraph.unionTypes(this, retType);

    /* TODO
    // Merge with all possible branch targets
    for (var i = 0; i < this.targets.length; ++i)
        ta.succMerge(this.targets[i], typeMap);
    */
}

/*
ArgValInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Get the info object for this function
    var func = this.parentBlock.parentCFG.ownerFunc;
    var funcInfo = ta.getFuncInfo(func);
    
    // Return the type for this argument
    var argType = funcInfo.argTypes[this.argIndex];
    return ta.setOutput(typeMap, this, argType);
}
*/

/*
RetInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Get the info object for this function
    var func = this.parentBlock.parentCFG.ownerFunc;
    var funcInfo = ta.getFuncInfo(func);
 
    var retType = typeMap.getType(this.uses[0]);

    // Merge the return type
    var newType = retType.union(funcInfo.retType);

    // If the return type changed
    if (newType.equal(funcInfo.retType) === false)
    {
        // Update the function return type
        funcInfo.retType = newType;

        // Queue the call site blocks for analysis
        for (var i = 0; i < funcInfo.callerList.length; ++i)
        {
            var callInstr = funcInfo.callerList[i];
            ta.queueBlock(callInstr.parentBlock);
        }
    }
}
*/

/*
JSNewInstr.prototype.typeProp = function (ta, typeGraph)
{
    // TODO: Want to get the 'this' type at the function output

    // TODO
    //return ta.setOutput(typeMap, this, TypeDesc.any);
}
*/

/*
// If branching instruction
IfInstr.prototype.typeProp = function (ta, typeGraph)
{
    var v0 = typeMap.getType(this.uses[0]);
    var v1 = typeMap.getType(this.uses[1]);
    var v2 = (this.uses.length > 2)? typeMap.getType(this.uses[1]):undefined;

    // Function to handle the known branching side case
    var instr = this;
    function knownBranch(boolVal)
    {
        var target = instr.targets[(boolVal === true)? 0:1];
        ta.succMerge(target, typeMap);
        return TypeDesc.any;
    }

    if (this.testOp === 'EQ')
    {
        if ((v0.flags === TypeFlags.TRUE && v1.flags === TypeFlags.TRUE) ||
            (v0.flags === TypeFlags.FALSE && v1.flags === TypeFlags.FALSE))
            return knownBranch(true);

        if ((v0.flags === TypeFlags.FALSE && v1.flags === TypeFlags.TRUE) ||
            (v0.flags === TypeFlags.TRUE && v1.flags === TypeFlags.FALSE))
            return knownBranch(false);
    }

    // Merge with all possible branch targets
    for (var i = 0; i < this.targets.length; ++i)
        ta.succMerge(this.targets[i], typeMap);
}
*/

/*
JumpInstr.prototype.typeProp = function (ta, typeGraph)
{
    //ta.succMerge(this.targets[0], typeMap);
}
*/


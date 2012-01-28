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
Basic block descriptor
*/
function BlockDesc(block, instrIdx)
{
    if (instrIdx === undefined)
        instrIdx = 0;

    this.block = block;

    this.instrIdx = instrIdx;
}

/**
Hash function for block descriptors
*/
BlockDesc.hashFn = function (d)
{
    return defHashFunc(d.block) + d.instrIdx;
}

/**
Equality function for block descriptors
*/
BlockDesc.equalFn = function (d1, d2)
{
    return d1.block === d2.block && d1.instrIdx === d2.instrIdx;
}

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

    /**
    Verbose logging flag, enables debug output
    */
    this.verbose = false;

    // Initialize the type analysis
    this.init();
}

/**
Initialize/reset the analysis
*/
TypeProp.prototype.init = function ()
{
    // Clear the object map
    TGObject.objMap.clear();

    /**
    Worklist of basic blocks queued to be analyzed
    */
    this.workList = new LinkedList();

    /**
    Set of blocks in the work list
    This is to avoid adding blocks to the work list twice
    */
    this.workSet = new HashSet(BlockDesc.hashFn, BlockDesc.equalFn);

    /**
    Map of type graphs at block entries
    */
    this.blockGraphs = new HashMap(BlockDesc.hashFn, BlockDesc.equalFn);

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
    Ordered list of unit-level functions (func info objects) to be analyzed
    */
    this.unitList = [];

    /**
    Map of hash sets for instruction uses, for gathering statistics
    */
    this.typeSets = new HashMap(
        function (use)
        {
            return defHashFunc(use.instr) + use.idx;
        },
        function (use1, use2)
        {
            return use1.instr === use2.instr && use1.idx === use2.idx;
        }
    );

    /**
    Map of type assertions calls to associated type sets
    */
    this.typeAsserts = new HashMap();

    /**
    Total analysis iteration count
    */
    this.itrCount = 0;
}

/**
Get the type graph for a basic block
*/
TypeProp.prototype.getTypeGraph = function (blockDesc)
{
    assert (
        blockDesc instanceof BlockDesc,
        'invalid block descriptor'
    );

    var graph = this.blockGraphs.get(blockDesc);

    return graph;
}

/**
Set the type graph for a basic block
*/
TypeProp.prototype.setTypeGraph = function (blockDesc, typeGraph)
{
    assert (
        blockDesc instanceof BlockDesc,
        'invalid block descriptor'
    );

    this.blockGraphs.set(blockDesc, typeGraph);
}

/**
Get the function info object for an IR function
*/
TypeProp.prototype.getFuncInfo = function (irFunc)
{
    // If an info object already exists, return it
    var info = this.funcInfo.get(irFunc);
    if (info !== HashMap.NOT_FOUND)
        return info;

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

        // Argument value nodes
        argNodes: argNodes,

        // Return value node
        retNode: retNode,

        // Type graph at returns
        retGraph: undefined,

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
TypeProp.prototype.queueBlock = function (blockDesc)
{
    assert (
        blockDesc instanceof BlockDesc,
        'invalid block descriptor'
    );

    // If the block is already queued, do nothing
    if (this.workSet.has(blockDesc) === true)
        return;

    this.workList.addLast(blockDesc);

    this.workSet.add(blockDesc);
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

    // Queue the function's entry block
    this.queueBlock(new BlockDesc(entry));
}

/**
Add a code unit to the analysis
*/
TypeProp.prototype.addUnit = function (ir)
{
    assert (
        ir.astNode instanceof Program,
        'IR object is not unit-level function'
    );

    // Get the info object for this function
    var funcInfo = this.getFuncInfo(ir);

    assert (
        this.unitList.indexOf(funcInfo) === -1,
        'unit already added'
    );

    // If this is the first unit
    if (this.unitList.length === 0)
    {
        // Set the type graph at the unit entry
        var entry = funcInfo.entry;
        this.setTypeGraph(new BlockDesc(entry), this.initGraph);

        // Queue the unit function to be analyzed
        this.queueFunc(ir);
    }
    else
    {
        // Set the next unit of the previous unit
        var prevUnit = this.unitList[this.unitList.length - 1];
        prevUnit.nextUnit = funcInfo;
    }

    // Add the unit to the list of units
    this.unitList.push(funcInfo);
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
    var blockDesc = this.workList.remFirst();
    this.workSet.rem(blockDesc);

    // Get a copy of the type set at the block entry
    var typeGraph = this.getTypeGraph(blockDesc).copy();

    // Get the block and instruction index
    var block = blockDesc.block;
    var instrIdx = blockDesc.instrIdx;

    if (this.verbose === true)
    {
        print('------')
        print(
            'Block: ' + block.getBlockName() + 
            ', instr: ' + instrIdx + 
            ' (' + block.parentCFG.ownerFunc.funcName + ')'
        );
        print('------')
        print('');
    }

    assert (
        typeGraph !== HashMap.NOT_FOUND,
        'type graph not found'
    );

    assert (
        instrIdx < block.instrs.length,
        'invalid instr idx'
    );

    // For each instruction
    for (var i = instrIdx; i < block.instrs.length; ++i)
    {
        var instr = block.instrs[i];

        // If this is a type assertion
        if (instr instanceof JSCallInstr &&
            instr.uses.length === 4 &&
            instr.uses[0] instanceof GetGlobalInstr &&
            instr.uses[0].uses[1] instanceof IRConst &&
            instr.uses[0].uses[1].value === 'typeAssert')
        {
            var typeSet = typeGraph.getTypeSet(instr.uses[2]);
            var test = instr.uses[3].value;

            // Store the type assertion for later evaluation
            this.typeAsserts.set(instr, { test:test, typeSet:typeSet });

            // Skip this instruction
            continue;
        }

        // If this the global get of a type assertion
        if (instr instanceof GetGlobalInstr &&
            instr.uses[1].value === 'typeAssert')
        {
            // Skip this instruction
            continue;
        }

        if (this.verbose === true)
        {
            print(instr);
        }

        // For each use of the instruction
        for (var j = 0; j < instr.uses.length; ++j)
        {
            var use = instr.uses[j];

            if ((use instanceof IRInstr || use instanceof IRConst) === false)
                continue;    

            var useType = typeGraph.getTypeSet(use);

            assert (
                useType instanceof TypeSet,
                'invalid use type'
            );

            if (this.verbose === true)
                print(use.getValName() + ' : ' + useType);

            // Store the last seen type set for this use
            this.typeSets.set({ instr: instr, idx: j }, useType);
        }

        // Process the instruction
        var ret = instr.typeProp(this, typeGraph);

        // If this is a call instruction and callees were found
        if (instr instanceof JSCallInstr && ret === true)
        {
            if (this.verbose === true)
                print('stopping block inference');

            // Stop the inference for this block, the return instruction
            // will queue the rest of the block
            return;
        }

        if (this.verbose === true)
        {
            if (instr.dests.length > 0)
                print(instr.getValName() + ' => ' + typeGraph.getTypeSet(instr));
            print('');
        }
    }
}

/**
Merge incoming types for a successor block
*/
TypeProp.prototype.succMerge = function (succ, predGraph)
{
    // Get a descriptor for the successor block
    var succDesc = new BlockDesc(succ);

    // Get the type map for the successor
    var succGraph = this.getTypeGraph(succDesc);

    // If the successor has no type graph yet
    if (succGraph === HashMap.NOT_FOUND)
    {
        // Pass a copy of the predecessor map to the successor
        this.blockGraphs.set(succDesc, predGraph.copy());

        // Queue the successor for analysis
        this.queueBlock(succDesc);
    }
    else
    {
        // Merge the predecessor type map into the successor's
        var newGraph = succGraph.merge(predGraph);

        // If the successor's type map was changed,
        // queue the successor for analysis
        if (newGraph.equal(succGraph) === false)
        {
            this.blockGraphs.set(succDesc, newGraph);
            this.queueBlock(succDesc);
        }
    }
}

/**
Set an intruction's output and queue its branch targets
*/
TypeProp.prototype.setOutput = function (
    typeGraph,
    instr,
    normalType,
    exceptType
)
{
    // If the instruction has dests, add its type to the type set
    if (instr.dests.length > 0)
        typeGraph.assignTypes(instr, normalType);

    // If this is a branch instruction
    if (instr.targets.length > 0)
    {
        assert (
            instr.targets.length === 2,
            'invalid branch target count'
        );

        // By default, the exception type is the any type
        if (exceptType === undefined)
            exceptType = TypeSet.any;

        // Merge with the normal target
        this.succMerge(instr.targets[i], typeGraph);

        // If the instruction has dests, set its type along the exception edge
        if (instr.dests.length > 0)
            typeGraph.assignTypes(instr, exceptType);

        // Merge with the exception target
        this.succMerge(instr.targets[1], typeGraph);
    }

    // Return the output type
    return normalType;
}

/**
Set the type of an instruction's input value
*/
TypeProp.prototype.setInput = function (
    typeGraph,
    instr,
    val,
    normalType,
    exceptType
)
{
    // If this value is not an instruction or has only one dest,
    // do not update its type
    if ((val instanceof IRInstr) === false || val.dests.length <= 1)
        return;

    // If this is not a branch instruction
    if (instr.targets.length === 0)
    {
        // Set the value's normal branch type
        typeGraph.assignTypes(val, normalType);
    }
    else
    {
        assert (
            instr.targets.length === 2,
            'invalid branch target count'
        );

        // Exclude this value from the successor merge
        typeGraph.remVar(val);

        // Merge the normal branch type
        normalMap = ta.getTypeGraph(instr.targets[0]);
        var typeSet = normalMap.getTypeSet(val);
        var newTypeSet = typeSet.union(normalType);
        if (typeSet.equal(newTypeSet) === false)
            ta.queueBlock(instr.targets[0]);

        // Merge the exception branch type
        exceptMap = ta.getTypeGraph(this.targets[1]);
        var typeSet = exceptMap.getTypeSet(val);
        var newTypeSet = typeSet.union(normalType);
        if (typeSet.equal(newTypeSet) === false)
            ta.queueBlock(instr.targets[1]);
    }
}

//=============================================================================
//
// Flow functions for HIR instructions
//
//=============================================================================

IRInstr.prototype.typeProp = function (ta, typeGraph)
{
    // By default, return the any type
    ta.setOutput(typeGraph, this, TypeSet.any);
}

PhiInstr.prototype.typeProp = function (ta, typeGraph)
{
    var outType = TypeSet.empty;

    // For each phi predecessor
    for (var i = 0; i < this.preds.length; ++i)
    {
        var pred = this.preds[i];

        // If this predecessor hasn't been visited, skip it
        if (ta.blockGraphs.has(new BlockDesc(pred)) === false)
            continue;

        // Merge the type of this incoming value
        var incType = typeGraph.getTypeSet(this.uses[i]);
        outType = outType.union(incType);
    }

    assert (
        outType.flags !== TypeFlags.EMPTY,
        'phi output type is empty set'
    );

    typeGraph.assignTypes(this, outType);
}

GlobalObjInstr.prototype.typeProp = function (ta, typeGraph)
{
    // This refers to the global object
    ta.setOutput(typeGraph, this, ta.globalObj);
}

InitGlobalInstr.prototype.typeProp = function (ta, typeGraph)
{
    var propName = this.uses[1].value;

    var globalObj = ta.globalObj.getObjItr().get();

    var propNode = globalObj.getPropNode(propName);

    typeGraph.assignTypes(propNode, TypeSet.undef);
}

BlankObjInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Create a new object from the object prototype
    var newObj = typeGraph.newObject(this, ta.objProto);

    // The result is the new object
    ta.setOutput(typeGraph, this, newObj);
}

BlankArrayInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Create a new array object from the array prototype
    var newObj = typeGraph.newObject(this, ta.arrProto, TypeFlags.ARRAY);

    // The result is the new object
    ta.setOutput(typeGraph, this, newObj);
}

HasPropInstr.prototype.typeProp = function (ta, typeGraph)
{
    ta.setOutput(typeGraph, this, TypeSet.bool);
}

PutPropInstr.prototype.typeProp = function (ta, typeGraph)
{
    var objSet = typeGraph.getTypeSet(this.uses[0]);
    var nameSet = typeGraph.getTypeSet(this.uses[1]);
    var valSet = typeGraph.getTypeSet(this.uses[2]);

    try
    {
        if (objSet.flags === TypeFlags.ANY)
            throw '*WARNING: putProp on any type';

        if ((objSet.flags & TypeFlags.OBJEXT) === 0)
            throw '*WARNING: putProp on non-object';

        if (nameSet.flags === TypeFlags.ANY)
            throw '*WARNING: putProp with any name';

        // If this is not a string constant
        if (nameSet.flags !== TypeFlags.STRING || nameSet.strVal === undefined)
            throw '*WARNING: putProp with unknown property name:' + nameSet;

        var propName = nameSet.strVal;

        // For each possible object
        for (objItr = objSet.getObjItr(); objItr.valid(); objItr.next())
        {
            var obj = objItr.get();

            // Get the node for this property
            var propNode = obj.getPropNode(propName);

            // Assign the value type set to the property
            if ((obj.origin.parentBlock === this.parentBlock && 
                 this.uses[0] === obj.origin) ||
                obj.isSingleton() === true)
                typeGraph.assignTypes(propNode, valSet);
            else
                typeGraph.unionTypes(propNode, valSet);
        }
    }

    // If an inference problem occurs
    catch (e)
    {
        if (e instanceof Error)
            throw e;

        if (this.verbose === true)
            print(e);
    }

    // The object cannot be undefined or null along the normal branch
    var newObjType = objSet.restrict(TypeFlags.ANY & ~(TypeFlags.UNDEF | TypeFlags.NULL));

    // Update the object type
    ta.setInput(typeGraph, this, this.uses[0], newObjType, objSet);

    ta.setOutput(typeGraph, this, valSet);
}

GetPropInstr.prototype.typeProp = function (ta, typeGraph)
{
    var objSet = typeGraph.getTypeSet(this.uses[0]);
    var nameSet = typeGraph.getTypeSet(this.uses[1]);

    try
    {
        if (objSet.flags === TypeFlags.ANY)
            throw '*WARNING: getProp on any type';

        if (nameSet.flags === TypeFlags.ANY)
            throw '*WARNING: getProp with any name';

        // If this is not a string constant
        if (nameSet.flags !== TypeFlags.STRING || nameSet.strVal === undefined)
            throw '*WARNING: getProp with unknown property name:' + nameSet;

        // If there are non-object bases
        if (objSet.flags & 
            ~(TypeFlags.OBJEXT | 
              TypeFlags.UNDEF | 
              TypeFlags.NULL)
            )
            throw '*WARNING: getProp with non-object base';

        // Get the property name string
        var propName = nameSet.strVal;

        // Output type set
        var outSet = TypeSet.empty;

        // For each possible object
        for (objItr = objSet.getObjItr(); objItr.valid(); objItr.next())
        {
            var obj = objItr.get();

            // Get the node for this property
            var propNode = obj.getPropNode(propName);

            // Union the types for this property into the type set
            outSet = outSet.union(typeGraph.getTypeSet(propNode));
        }

        ta.setOutput(typeGraph, this, outSet);
    }

    // If an inference problem occurs
    catch (e)
    {
        if (e instanceof Error)
            throw e;

        if (this.verbose === true)
            print(e);

        ta.setOutput(typeGraph, this, TypeSet.any);
    }
}

GetGlobalInstr.prototype.typeProp = GetPropInstr.prototype.typeProp;

JSAddInstr.prototype.typeProp = function (ta, typeGraph)
{
    var t0 = typeGraph.getTypeSet(this.uses[0]);
    var t1 = typeGraph.getTypeSet(this.uses[1]);

    // Output type
    var outType;

    if (t0.flags === TypeFlags.INT && t1.flags === TypeFlags.INT)
    {
        var minVal = t0.rangeMin + t1.rangeMin;

        var maxVal = t0.rangeMax + t1.rangeMax;

        outType = new TypeSet(
            TypeFlags.INT,
            minVal,
            maxVal
        );
    }

    // TODO: addition of string + int, etc., string conversion
    else if (t0.flags === TypeFlags.STRING || t1.flags === TypeFlags.STRING)
    {
        var t0Str = t0.strVal;
        var t1Str = t1.strVal;

        var newStr = (t0Str && t1Str)? (t0Str + t1Str):undefined;

        outType = new TypeSet(
            TypeFlags.STRING,
            undefined,
            undefined,
            newStr
        );
    }

    else if ((t0.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0 &&
        (t1.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0)
    {
        outType = new TypeSet(TypeFlags.INT | TypeFlags.STRING)
    }

    // By default
    else
    {
        outType = new TypeSet(TypeFlags.INT | TypeFlags.FLOAT | TypeFlags.STRING);
    }

    ta.setOutput(typeGraph, this, outType);
}

JSSubInstr.prototype.typeProp = function (ta, typeGraph)
{
    var t0 = typeGraph.getTypeSet(this.uses[0]);
    var t1 = typeGraph.getTypeSet(this.uses[1]);

    // Output type
    var outType;

    if (t0.flags === TypeFlags.INT && t1.flags === TypeFlags.INT)
    {
        var minVal = t0.rangeMin - t1.rangeMax;
        var maxVal = t0.rangeMax - t1.rangeMin;

        outType = new TypeSet(
            TypeFlags.INT,
            minVal,
            maxVal
        );
    }

    else if ((t0.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0 &&
             (t1.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0)
    {
        outType = new TypeSet(TypeFlags.INT)
    }

    // By default
    else
    {
        outType = new TypeSet(TypeFlags.INT | TypeFlags.FLOAT);
    }

    ta.setOutput(typeGraph, this, outType);
}

JSLtInstr.prototype.typeProp = function (ta, typeGraph)
{
    var v0 = typeGraph.getTypeSet(this.uses[0]);
    var v1 = typeGraph.getTypeSet(this.uses[1]);

    // TODO:
    return ta.setOutput(typeGraph, this, TypeSet.bool);
}

JSEqInstr.prototype.typeProp = function (ta, typeGraph)
{
    var v0 = typeGraph.getTypeSet(this.uses[0]);
    var v1 = typeGraph.getTypeSet(this.uses[1]);

    // Output type
    var outType;

    // If both values are known integer constants
    if (v0.flags === TypeFlags.INT &&
        v1.flags === TypeFlags.INT &&
        v0.rangeMin === v0.rangeMax &&
        v1.rangeMin === v1.rangeMax)
    {
        outType = (v0.rangeMin === v1.rangeMin)? TypeSet.true:TypeSet.false;
    }

    // If both values are known booleans
    else if ((v0.flags === TypeFlags.TRUE || v0.flags === TypeFlags.FALSE) &&
             (v1.flags === TypeFlags.TRUE || v1.flags === TypeFlags.FALSE))
    {
        outType = (v0.flags === v1.flags)? TypeSet.true:TypeSet.false;
    }

    // Otherwise, we know the output is boolean
    else
    {
        outType = TypeSet.bool;
    }

    ta.setOutput(typeGraph, this, outType);
}

JSNsInstr.prototype.typeProp = function (ta, typeGraph)
{
    // TODO:
    return ta.setOutput(typeGraph, this, TypeSet.bool);
}

JSCallInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Get the type set for the callee
    var calleeType = typeGraph.getTypeSet(this.uses[0]);

    // Test if this is a new/constructor call
    var isNew = this instanceof JSNewInstr;

    // If this is a regular function call
    if (isNew === false)
    {
        // Get the this argument call
        var thisType = typeGraph.getTypeSet(this.uses[1]);
    }
    else
    {
        // FIXME: eventually, need lookup on Function.prototype
        // Create a new object to use as the this argument
        var thisType = typeGraph.newObject(this, ta.objProto);
    }

    // If the callee is unknown
    if (calleeType.flags & TypeFlags.any)
    {
        if (this.verbose === true)
            print('*WARNING: unknown callee');

        ta.setOutput(typeGraph, this, TypeSet.any);

        // Don't stop the inference for this block
        return false;
    }

    // For each potential callee
    for (var itr = calleeType.getObjItr(); itr.valid(); itr.next())
    {
        var callee = itr.get();

        // Get the function for this class
        var func = callee.origin;

        // If this is not a function, ignore it
        if ((func instanceof IRFunction) === false)
            continue;

        //print('potential callee: ' + func.funcName);

        // Get the info object for this function
        var funcInfo = ta.getFuncInfo(func);

        // Create a type set for this function only
        var funcSet = new HashSet();
        funcSet.add(callee);
        var funcType = new TypeSet(
            callee.flags, 
            undefined, 
            undefined, 
            undefined, 
            funcSet
        );

        // For each argument
        for (var j = 0; j < funcInfo.argNodes.length; ++j)
        {
            var argNode = funcInfo.argNodes[j];

            // Get the incoming type for this argument
            if (j === 0)
            {
                argTypeSet = funcType;
            }
            else if (j === 1)
            {
                argTypeSet = thisType;
            }
            else
            {
                var useIdx = (isNew === true)? (j-1):j;
                argTypeSet =
                    (j < this.uses.length)?
                    typeGraph.getTypeSet(this.uses[useIdx]):
                    TypeSet.undef;
            }

            // Set the types for this argument in the current graph
            typeGraph.assignTypes(argNode, argTypeSet);
        }

        // Get a descriptor for the entry block
        var entryDesc = new BlockDesc(funcInfo.entry);

        // Get the type graph at the function entry
        var entryGraph = ta.getTypeGraph(entryDesc);

        // Merge the entry graph with the current type graph
        if (entryGraph === HashMap.NOT_FOUND)
            var newGraph = typeGraph.copy();
        else
            var newGraph = entryGraph.merge(typeGraph);

        // Restrict the callee type to functions
        var newCalleeType = calleeType.restrict(TypeFlags.FUNCTION);        
        newGraph.assignTypes(this.uses[0], newCalleeType);

        // If the graph changed
        if (entryGraph === HashMap.NOT_FOUND || 
            newGraph.equal(entryGraph) === false)
        {
            // Update the entry graph
            ta.setTypeGraph(entryDesc, newGraph);

            // Queue the function for analysis
            ta.queueFunc(func);
        }

        // Add this instruction to the set of callers
        if (funcInfo.callerSet.has(this) === false)
        {
            funcInfo.callerSet.add(this);
            funcInfo.callerList.push(this);
        }
    }

    // Stop the inference for this block
    return true;
}

// New/constructor call instruction
// Handled by the same function as the regular call instruction
JSNewInstr.prototype.typeProp = JSCallInstr.prototype.typeProp;

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
        retType = TypeSet.any;
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
        var funcObj = typeGraph.newObject(func, ta.funcProto, TypeFlags.FUNCTION);

        retType = funcObj;
    }

    // For other primitive functions
    else
    {
        // Do nothing
        retType = TypeSet.any;
    }

    // Set our own output type in the type graph
    ta.setOutput(typeGraph, this, retType);

    // Merge with all possible branch targets
    for (var i = 0; i < this.targets.length; ++i)
        ta.succMerge(this.targets[i], typeGraph);
}

ArgValInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Get the info object for this function
    var func = this.parentBlock.parentCFG.ownerFunc;
    var funcInfo = ta.getFuncInfo(func);

    var argNode = funcInfo.argNodes[this.argIndex];
    var argTypeSet = typeGraph.getTypeSet(argNode);

    typeGraph.assignTypes(this, argTypeSet);
}

RetInstr.prototype.typeProp = function (ta, typeGraph)
{
    // Get the return type
    var retType = typeGraph.getTypeSet(this.uses[0]);

    // Get the info object for this function
    var func = this.parentBlock.parentCFG.ownerFunc;
    var funcInfo = ta.getFuncInfo(func);
 
    // Merge the return type
    typeGraph.unionTypes(funcInfo.retNode, retType);

    // Get the return point graph
    var retGraph = funcInfo.retGraph;

    // Merge the current type graph into the return graph
    if (retGraph === undefined)
        var newGraph = typeGraph.copy();
    else
        var newGraph = retGraph.merge(typeGraph);

    // If the return graph changed
    if (retGraph === undefined || retGraph.equal(newGraph) === false)
    {
        // Update the return graph
        funcInfo.retGraph = newGraph;

        // If this is a unit-level function
        if (funcInfo.nextUnit !== undefined)
        {
            // The continuation is the next unit's entry
            var contDesc = new BlockDesc(funcInfo.nextUnit.entry);

            // Copy the type graph for the next unit
            var nextGraph = typeGraph.copy();

            // Queue the continuation block for analysis
            ta.setTypeGraph(contDesc, nextGraph);
            ta.queueBlock(contDesc);
        }

        // Otherwise, this is a regular function
        else
        {
            // For each caller
            for (var i = 0; i < funcInfo.callerList.length; ++i)
            {
                var callInstr = funcInfo.callerList[i];
                var callerBlock = callInstr.parentBlock;

                // Get the function return type
                var funcRetType = newGraph.getTypeSet(funcInfo.retNode);

                // If this is a regular call instruction
                if (callInstr instanceof JSCallInstr)
                {
                    // Set the return type for the call instruction
                    newGraph.assignTypes(callInstr, funcRetType);
                }

                // Otherwise, this is a constructor call
                else
                {
                    var newType = TypeSet.empty;

                    // If the return type may be undefined
                    if (funcRetType.flags & TypeFlags.UNDEF)
                    {
                        // Union the this argument type
                        var thisType = newGraph.getTypeSet(funcInfo.argNodes[1]);
                        newType = newType.union(thisType);
                    }

                    // If the return type may be not undefined
                    if (funcRetType.flags !== TypeFlags.UNDEF)
                    {
                        // Union all but undefined
                        newType = newType.union(funcRetType.restrict(
                            funcRetType.flags & ~TypeFlags.UNDEF
                        ));
                    }

                    // Set the return type for the new instruction
                    newGraph.assignTypes(callInstr, newType);
                }

                // If there is a call continuation block
                if (callInstr.targets[0] instanceof BasicBlock)
                {
                    // Use the continuation target
                    var contDesc = new BlockDesc(callInstr.targets[0]);
                }
                else
                {
                    // The continuation is the rest of the caller block
                    var instrIdx = callerBlock.instrs.indexOf(callInstr);
                    var contDesc = new BlockDesc(callerBlock, instrIdx + 1);
                }

                // Queue the continuation block for analysis
                ta.setTypeGraph(contDesc, newGraph);
                ta.queueBlock(contDesc);
            }
        }
    }
}

// If branching instruction
IfInstr.prototype.typeProp = function (ta, typeGraph)
{
    var v0 = typeGraph.getTypeSet(this.uses[0]);
    var v1 = typeGraph.getTypeSet(this.uses[1]);
    var v2 = (this.uses.length > 2)? typeGraph.getTypeSet(this.uses[1]):undefined;

    // Function to handle the known branching side case
    var instr = this;
    function knownBranch(boolVal)
    {
        var target = instr.targets[(boolVal === true)? 0:1];
        ta.succMerge(target, typeGraph);
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
        ta.succMerge(this.targets[i], typeGraph);
}

JumpInstr.prototype.typeProp = function (ta, typeGraph)
{
    ta.succMerge(this.targets[0], typeGraph);
}

// TODO
// TODO: throw, must merge with all possible catch points
// TODO


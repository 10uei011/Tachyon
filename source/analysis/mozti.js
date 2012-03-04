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
// Mozilla Type Inference analysis core
//
//=============================================================================

/**
@class Mozilla-style Type Inference interprocedural analysis
@extends TypeAnalysis
*/
function MozTI()
{
    // Initialize the type analysis
    this.init();
}
MozTI.prototype = new TypeAnalysis();

/**
Initialize/reset the analysis
*/
MozTI.prototype.init = function ()
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
    Ordered list of unit-level functions (func info objects) to be analyzed
    */
    this.unitList = [];

    /**
    Total analysis iteration count
    */
    this.itrCount = 0;

    /**
    Total analysis time
    */
    this.totalTime = 0;
}

/**
Dump information gathered about functions during analysis
*/
MozTI.prototype.dumpFunctions = function ()
{
    // TODO
}

/**
Dump information gathered about objects during analysis
*/
MozTI.prototype.dumpObjects = function ()
{
    // TODO
}

/**
Compute statistics about type sets
*/
MozTI.prototype.compTypeStats = function ()
{
    // TODO

    /*
    const ta = this;

    function compPercent(num, denom)
    {
        if (denom === 0)
            return 'N/A';

        return Number(100 * num / denom).toFixed(0);
    }

    function Stat(name)
    {
        this.name = name;
        this.trueCnt = 0;
        this.falseCnt = 0;
    }

    Stat.prototype.count = function (val)
    {
        if (val)
            this.trueCnt++;
        else
            this.falseCnt++;
    }

    Stat.prototype.toString = function ()
    {
        var total = this.trueCnt + this.falseCnt;        

        var percent = compPercent(this.trueCnt, total);

        return this.name + ': ' + percent + '% (' + this.trueCnt + '/' + total + ')';
    }

    var maxNumObjs = 0;

    var getObj      = new Stat('getProp on object only');
    var getSingle   = new Stat('getProp on known object');
    var getDef      = new Stat('getProp output not undef');

    var putObj      = new Stat('putProp on object only');
    var putSingle   = new Stat('putProp on known object');

    var callMono    = new Stat('function call monomorphic');

    var arithInt    = new Stat('arith op on int & int');
    var cmpInt      = new Stat('compare op on int & int');

    var branchKnown = new Stat('branch direction known');

    function accumStats(instr)
    {
        assert (
            instr instanceof IRInstr,
            'invalid instruction'
        );

        var outType = ta.typeSets.get({ instr:instr });    

        var useTypes = [];

        for (var i = 0; i < instr.uses.length; ++i)
        {
            var type = ta.typeSets.get({ instr:instr, idx:i });
          
            if ((type instanceof TypeSet) === false)
                return;

            useTypes.push(type);
        }

        if (outType instanceof TypeSet)
            maxNumObjs = Math.max(maxNumObjs, outType.getNumObjs());

        // Get property instruction
        if (instr instanceof GetPropInstr || instr instanceof GetGlobalInstr)
        {
            var u0 = useTypes[0];

            getObj.count((u0.flags & ~TypeFlags.EXTOBJ) === 0);

            getSingle.count(
                (u0.flags & ~TypeFlags.EXTOBJ) === 0 &&
                u0.getNumObjs() === 1
            );

            getDef.count((outType.flags & TypeFlags.UNDEF) === 0);
        }

        // Put property instruction
        else if (instr instanceof PutPropInstr)
        {
            var u0 = useTypes[0];

            putObj.count((u0.flags & ~TypeFlags.EXTOBJ) === 0);

            putSingle.count(
                (u0.flags & ~TypeFlags.EXTOBJ) === 0 &&
                u0.getNumObjs() === 1
            );
        }

        // Function call/new instruction
        else if (instr instanceof JSCallInstr || instr instanceof JSNewInstr)
        {
            var u0 = useTypes[0];

            callMono.count(u0.getNumObjs() === 1);
        }

        // Arithmetic instructions
        else if (instr instanceof JSArithInstr)
        {
            var u0 = useTypes[0];
            var u1 = useTypes[1];

            arithInt.count(u0.flags === TypeFlags.INT && u1.flags === TypeFlags.INT);
        }

        // Comparison instructions
        else if (instr instanceof JSCompInstr)
        {
            var u0 = useTypes[0];
            var u1 = useTypes[1];

            cmpInt.count(u0.flags === TypeFlags.INT && u1.flags === TypeFlags.INT);
        }

        // If instruction
        else if (instr instanceof IfInstr)
        {
            var u0 = useTypes[0];
            var u1 = useTypes[1];

            branchKnown.count(
                (u0.flags === TypeFlags.TRUE || u0.flags === TypeFlags.FALSE) &&
                (u1.flags === TypeFlags.TRUE || u1.flags === TypeFlags.FALSE)
            );
        }
    }

    // For each block type graph we have
    for (var itr = this.blockGraphs.getItr(); itr.valid(); itr.next())
    {
        var blockDesc = itr.get().key;

        var block = blockDesc.block;
        var instrIdx = blockDesc.instrIdx;

        // If this is library code, skip it
        if (this.fromLib(block) === true)
            continue;

        // For each instruction of the block
        for (var i = instrIdx; i < block.instrs.length; ++i)
        {
            var instr = block.instrs[i];

            accumStats(instr);

            // If this is a call instruction, this is the end of the block
            if ((instr instanceof JSCallInstr || instr instanceof JSNewInstr) &&
                isTypeAssert(instr) === false)
                break;
        }
    }

    print('Max num objs: ' + maxNumObjs);
    print('');

    print(getObj);
    print(getSingle);
    print(getDef);
    print('');

    print(putObj);
    print(putSingle);
    print('');

    print(callMono);
    print('');

    print(arithInt);
    print(cmpInt);
    print('');

    print(branchKnown);
    print('');
    */
}

/**
Evaluate type assertions, throw an exception if any fail
*/
MozTI.prototype.evalTypeAsserts = function ()
{
    // For now, do nothing. The type assertions are representative
    // of the capabilities of the type propagation analysis.
}

/**
Queue a block to be (re)analyzed
*/
MozTI.prototype.queueBlock = function (blockDesc)
{
    // If the block is already queued, do nothing
    if (this.workSet.has(blockDesc) === true)
        return;

    this.workList.addLast(blockDesc);

    this.workSet.add(blockDesc);
}

/**
Queue a function to be analyzed
*/
MozTI.prototype.queueFunc = function (irFunc)
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
MozTI.prototype.addUnit = function (ir)
{
    assert (
        ir.astNode instanceof Program,
        'IR object is not unit-level function'
    );

    /*
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
    */
}

/**
Run the analysis until fixed-point or until the maximum number of
iterations is reached
*/
MozTI.prototype.run = function (maxItrs)
{
    // Start timing the analysis
    var startTimeMs = (new Date()).getTime();

    // Until the max iteration count is reached
    for (var numItrs = 0; maxItrs === undefined || numItrs < maxItrs; ++numItrs)
    {
        // If the work list is empty, stop
        if (this.workList.isEmpty() === true)
            break;

        // Run one analysis iteration
        this.iterate();
    }

    // Stop the timing
    var endTimeMs = (new Date()).getTime();
    var time = (endTimeMs - startTimeMs) / 1000;

    // Update the total iteration count
    this.itrCount += numItrs;

    // Update the total analysis time
    this.totalTime += time;

    // Return the number of iterations performed
    return numItrs;
}

/**
Run one analysis iteration
*/
MozTI.prototype.iterate = function ()
{
    assert (
        this.workList.isEmpty() === false,
            'empty work list'
    );

    // Remove a block from the work list
    var blockDesc = this.workList.remFirst();
    this.workSet.rem(blockDesc);

    /*
    // Get a copy of the type set at the block entry
    var typeGraph = this.getTypeGraph(blockDesc).copy(true, true);

    // Get the block and instruction index
    var block = blockDesc.block;
    var instrIdx = blockDesc.instrIdx;

    if (config.verbosity >= log.DEBUG)
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
    */

    // For each instruction
    for (var i = instrIdx; i < block.instrs.length; ++i)
    {
        var instr = block.instrs[i];

        // If this is a type assertion
        if (isTypeAssert(instr) === true)
        {
            var typeSet = typeGraph.getType(instr.uses[2]);
            var test = instr.uses[3].value;

            // Store the type assertion for later evaluation
            this.typeAsserts.set(instr, { test:test, typeSet:typeSet });

            // Skip this instruction
            continue;
        }

        // If this the global get of a type assertion
        if (isTypeAssertUse(instr) === true)
        {
            // Skip this instruction
            continue;
        }

        if (config.verbosity >= log.DEBUG)
        {
            print(instr);
        }

        /*
        // For each use of the instruction
        for (var j = 0; j < instr.uses.length; ++j)
        {
            var use = instr.uses[j];

            if ((use instanceof IRInstr || use instanceof IRConst) === false)
                continue;    

            var useType = typeGraph.getType(use);

            assert (
                useType instanceof TypeSet,
                'invalid use type'
            );

            if (config.verbosity >= log.DEBUG)
                print(use.getValName() + ' : ' + useType);

            // Store the last seen type set for this use
            this.typeSets.set({ instr: instr, idx: j }, useType);
        }
        */

        // Process the instruction
        var ret = instr.mozTI(this, typeGraph);

        /*
        // If this is a call/new instruction and callees were found
        if ((instr instanceof JSCallInstr || instr instanceof JSNewInstr) && ret === true)
        {
            if (config.verbosity >= log.DEBUG)
                print('stopping block inference\n');

            // Stop the inference for this block, the return instruction
            // will queue the rest of the block
            return;
        }
        
        // Get the instruction's output type
        var outType = typeGraph.getType(instr);

        // Store the last seen type set for the instruction's output
        this.typeSets.set({ instr: instr }, outType);
        
        if (config.verbosity >= log.DEBUG)
        {
            if (instr.dests.length > 0)
                print(instr.getValName() + ' => ' + outType);
            print('');
        }
        */
    }
}

/**
Merge incoming types for a successor block
*/
MozTI.prototype.succMerge = function (succ, predGraph)
{
    // Get a descriptor for the successor block
    var succDesc = new BlockDesc(succ);

    // Get the type map for the successor
    var succGraph = this.getTypeGraph(succDesc);

    // If the successor has no type graph yet
    if (succGraph === HashMap.NOT_FOUND)
    {
        var newGraph = predGraph.copy(true, true);

        // Pass a copy of the predecessor map to the successor
        this.setTypeGraph(succDesc, newGraph);

        // Queue the successor for analysis
        this.queueBlock(succDesc);
    }
    else
    {
        // Merge the predecessor type map into the successor's
        var newGraph = succGraph.merge(predGraph, true, true);

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
MozTI.prototype.setOutput = function (
    typeGraph,
    instr,
    normalType,
    exceptType
)
{
    // TODO

    /*
    // If the instruction has dests, add its type to the type set
    if (instr.dests.length > 0)
        typeGraph.assignType(instr, normalType);

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
            typeGraph.assignType(instr, exceptType);

        // Merge with the exception target
        this.succMerge(instr.targets[1], typeGraph);
    }

    // Return the output type
    return normalType;
    */
}

//=============================================================================
//
// Per-instruction flow/transfer functions
//
//=============================================================================

IRInstr.prototype.mozTI = function (ta, typeGraph)
{
    // By default, return the any type
    ta.setOutput(typeGraph, this, TypeSet.any);
}

// TODO
/*
PhiInstr.prototype.mozTI = function (ta, typeGraph)
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
        var incType = typeGraph.getType(this.uses[i]);
        outType = outType.union(incType);
    }

    typeGraph.assignType(this, outType);
}
*/

// TODO
/*
GlobalObjInstr.prototype.mozTI = function (ta, typeGraph)
{
    // This refers to the global object
    ta.setOutput(typeGraph, this, ta.globalObj);
}
*/

// TODO
/*
InitGlobalInstr.prototype.mozTI = function (ta, typeGraph)
{
    var propName = this.uses[1].value;

    var globalObj = ta.globalObj.getObjItr().get();

    var propNode = globalObj.getPropNode(propName);

    typeGraph.assignType(propNode, TypeSet.undef);
}
*/

// TODO
/*
BlankObjInstr.prototype.mozTI = function (ta, typeGraph)
{
    // Create a new object from the object prototype
    var newObj = typeGraph.newObject(this, ta.objProto);

    // The result is the new object
    ta.setOutput(typeGraph, this, newObj);
}
*/

// TODO
/*
BlankArrayInstr.prototype.mozTI = function (ta, typeGraph)
{
    // Create a new array object from the array prototype
    var newObj = typeGraph.newObject(this, ta.arrProto, TypeFlags.ARRAY);

    // The result is the new object
    ta.setOutput(typeGraph, this, newObj);
}
*/

// TODO
/*
HasPropInstr.prototype.mozTI = function (ta, typeGraph)
{
    ta.setOutput(typeGraph, this, TypeSet.bool);
}
*/

// TODO
/*
PutPropInstr.prototype.mozTI = function (ta, typeGraph)
{
    var objType = typeGraph.getType(this.uses[0]);
    var nameType = typeGraph.getType(this.uses[1]);
    var valType = typeGraph.getType(this.uses[2]);

    try
    {
        if (objType.flags === TypeFlags.ANY)
            throw '*WARNING: putProp on any type';

        if ((objType.flags & TypeFlags.EXTOBJ) === 0)
            throw '*WARNING: putProp on non-object';

        if (nameType.flags === TypeFlags.ANY)
            throw '*WARNING: putProp with any name';

        // Get a reference to this function
        var func = this.parentBlock.parentCFG.ownerFunc;

        // If the object is the this argument of the function
        if (this.uses[0] instanceof ArgValInstr &&
            this.uses[0].argIndex === 1)
        {
            // Test if this function is only ever called as a constructor
            var funcInfo = ta.getFuncInfo(func);
            var isCtorThis = (funcInfo.normalCall === false);
        }

        // If this is not a string constant or an integer
        if ((nameType.flags !== TypeFlags.STRING || nameType.strVal === undefined) &&
            nameType.flags !== TypeFlags.INT)
            throw '*WARNING: putProp with unknown property name: ' + nameType;

        // Get the property name string, if any
        var propName = (nameType.flags === TypeFlags.STRING)? nameType.strVal:undefined;

        // If writing to an array property, add the undefined type
        if (nameType.flags === TypeFlags.INT)
            valType = valType.union(TypeSet.undef);

        // For each possible object
        for (var objItr = objType.getObjItr(); objItr.valid(); objItr.next())
        {
            var obj = objItr.get();

            // Get the node for this property
            if (propName !== undefined)
                var propNode = obj.getPropNode(propName);
            else
                var propNode = obj.idxProp;

            // Test if the object was created in this function
            var isLocalObj = (
                obj.origin.parentBlock !== undefined &&
                obj.origin.parentBlock.parentCFG.ownerFunc === func &&
                this.uses[0] === obj.origin
            );

            // Test if we can overwrite the current property type
            var canAssignType = (
                propNode !== obj.idxProp 
                && 
                (
                    isCtorThis === true ||
                    isLocalObj === true ||
                    obj.singleton === true
                )
            );

            // Update the property type
            if (canAssignType === true)
                typeGraph.assignType(propNode, valType);
            else
                typeGraph.unionType(propNode, valType);
        }
    }

    // If an inference problem occurs
    catch (e)
    {
        if (e instanceof Error)
            throw e;

        if (config.verbosity >= log.DEBUG)
        {
            print(e);
            print(this);
        }
    }

    // The object cannot be undefined or null along the normal branch
    var newObjType = objType.restrict(TypeFlags.ANY & ~(TypeFlags.UNDEF | TypeFlags.NULL));

    // Update the object type
    ta.setInput(typeGraph, this, this.uses[0], newObjType, objType);

    ta.setOutput(typeGraph, this, valType);
}
*/

// TODO
/*
GetPropInstr.prototype.mozTI = function (ta, typeGraph)
{
    var objType = typeGraph.getType(this.uses[0]);
    var nameType = typeGraph.getType(this.uses[1]);

    try
    {
        // If the property name could be anything
        if (nameType.flags === TypeFlags.ANY)
            throw '*WARNING: getProp with any name';

        // If this is not a string constant or an integer
        if ((nameType.flags !== TypeFlags.STRING || nameType.strVal === undefined) &&
            nameType.flags !== TypeFlags.INT)
            throw '*WARNING: getProp with unknown property name: ' + nameType;

        // If the property name is a string
        var propName;
        if (nameType.flags === TypeFlags.STRING)
        {
            propName = nameType.strVal;
        }
        else
        {
            // TODO: test for pos int, int < arr.length

            // For now, assume unbounded array access
            propName = false;
        }

        // Perform the property lookup
        var outType = ta.propLookup(typeGraph, objType, propName, 0);

        ta.setOutput(typeGraph, this, outType);
    }

    // If an inference problem occurs
    catch (e)
    {
        if (e instanceof Error)
            throw e;

        if (config.verbosity >= log.DEBUG)
        {
            print(e);
            print(this);
        }

        ta.setOutput(typeGraph, this, TypeSet.any);
    }
}*/

// TODO
/*
GetGlobalInstr.prototype.mozTI = GetPropInstr.prototype.mozTI;
*/

// TODO
/*
JSAddInstr.prototype.mozTI = function (ta, typeGraph)
{
    var t0 = typeGraph.getType(this.uses[0]);
    var t1 = typeGraph.getType(this.uses[1]);

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

    // If the values are either int or string
    else if ((t0.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0 &&
             (t1.flags & ~(TypeFlags.STRING | TypeFlags.INT)) === 0)
    {
        // The output is either int or string
        outType = new TypeSet(TypeFlags.INT | TypeFlags.STRING)
    }

    // If neither values can be string or object
    else if ((t0.flags & (TypeFlags.STRING | TypeFlags.EXTOBJ)) === 0 &&
             (t1.flags & (TypeFlags.STRING | TypeFlags.EXTOBJ)) === 0)
    {
        // The result can only be int or float
        outType = new TypeSet(TypeFlags.INT | TypeFlags.FLOAT);
    }

    // By default
    else
    {
        // The result can be int or float or string
        outType = new TypeSet(TypeFlags.INT | TypeFlags.FLOAT | TypeFlags.STRING);
    }

    ta.setOutput(typeGraph, this, outType);
}*/

// TODO
/*
JSSubInstr.prototype.mozTI = function (ta, typeGraph)
{
    var t0 = typeGraph.getType(this.uses[0]);
    var t1 = typeGraph.getType(this.uses[1]);

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

    // By default
    else
    {
        outType = new TypeSet(TypeFlags.INT | TypeFlags.FLOAT);
    }

    ta.setOutput(typeGraph, this, outType);
}
*/

// TODO
/*
JSMulInstr.prototype.mozTI = function (ta, typeGraph)
{
    var t0 = typeGraph.getType(this.uses[0]);
    var t1 = typeGraph.getType(this.uses[1]);

    // Output type
    var outType;

    if (t0.flags === TypeFlags.INT && t1.flags === TypeFlags.INT)
    {
        var minVal;
        minVal = t0.rangeMin * t1.rangeMin;
        minVal = Math.min(minVal, t0.rangeMin * t1.rangeMax);
        minVal = Math.min(minVal, t0.rangeMax * t1.rangeMin);

        var maxVal;
        maxVal = t0.rangeMax * t1.rangeMax;
        maxVal = Math.max(maxVal, t0.rangeMin * t1.rangeMin);

        outType = new TypeSet(
            TypeFlags.INT,
            minVal,
            maxVal
        );
    }

    // By default
    else
    {
        outType = new TypeSet(TypeFlags.INT | TypeFlags.FLOAT);
    }

    ta.setOutput(typeGraph, this, outType);
}
*/

// TODO
/*
JSDivInstr.prototype.mozTI = function (ta, typeGraph)
{
    var t0 = typeGraph.getType(this.uses[0]);
    var t1 = typeGraph.getType(this.uses[1]);

    // Output type
    var outType;

    if (t0.flags === TypeFlags.INT && t1.flags === TypeFlags.INT)
    {
        var minVal = 0;      
        if (Math.abs(t1.rangeMin) !== Infinity)
            minVal = Math.min(t0.rangeMin / t1.rangeMin);
        if (Math.abs(t1.rangeMax) !== Infinity)
            minVal = Math.min(t0.rangeMin / t1.rangeMax);
        if (Math.abs(t1.rangeMin) !== Infinity)
            minVal = Math.min(t0.rangeMax / t1.rangeMin);
        if (Math.abs(t1.rangeMax) !== Infinity)
            minVal = Math.min(t0.rangeMax / t1.rangeMax);

        var maxVal;
        if (Math.abs(t1.rangeMin) !== Infinity)
            maxVal = Math.max(t0.rangeMin / t1.rangeMin);
        if (Math.abs(t1.rangeMax) !== Infinity)
            maxVal = Math.max(t0.rangeMin / t1.rangeMax);
        if (Math.abs(t1.rangeMin) !== Infinity)
            maxVal = Math.max(t0.rangeMax / t1.rangeMin);
        if (Math.abs(t1.rangeMax) !== Infinity)
            maxVal = Math.max(t0.rangeMax / t1.rangeMax);

        var flags;
        if (t0.rangeMin === t0.rangeMax && 
            t1.rangeMin === t1.rangeMax &&
            t0.rangeMin % t1.rangeMax === 0)
            flags = TypeFlags.INT;
        else
            flags = TypeFlags.INT | TypeFlags.FLOAT;

        outType = new TypeSet(
            flags,
            minVal,
            maxVal
        );
    }

    // By default
    else
    {
        outType = new TypeSet(TypeFlags.INT | TypeFlags.FLOAT);
    }

    ta.setOutput(typeGraph, this, outType);
}
*/

// TODO
/*
// Bitwise operations
JSBitOpInstr.prototype.mozTI = function (ta, typeGraph)
{
    ta.setOutput(typeGraph, this, TypeSet.integer);
}
*/

// TODO
/*
// Comparison operator base class
JSCompInstr.prototype.mozTI = function (ta, typeGraph)
{
    var v0 = typeGraph.getType(this.uses[0]);
    var v1 = typeGraph.getType(this.uses[1]);

    return ta.setOutput(typeGraph, this, TypeSet.bool);
}
*/

// TODO
/*
// Operator ==
JSEqInstr.prototype.mozTI = function (ta, typeGraph)
{
    var v0 = typeGraph.getType(this.uses[0]);
    var v1 = typeGraph.getType(this.uses[1]);

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

    // If both values are known strings
    else if (
        v0.flags === TypeFlags.STRING && v1.flags === TypeFlags.STRING &&
        v0.strVal !== undefined && v1.strVal !== undefined)
    {
        outType = (v0.strVal === v1.strVal)? TypeSet.true:TypeSet.false;
    }

    // If both values are known booleans
    else if (
        (v0.flags === TypeFlags.TRUE || v0.flags === TypeFlags.FALSE) &&
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
*/

// TODO
/*
// Operator ===
JSSeInstr.prototype.mozTI = function (ta, typeGraph)
{
    var v0 = typeGraph.getType(this.uses[0]);
    var v1 = typeGraph.getType(this.uses[1]);

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

    // If both values are known strings
    else if (
        v0.flags === TypeFlags.STRING && v1.flags === TypeFlags.STRING &&
        v0.strVal !== undefined && v1.strVal !== undefined)
    {
        outType = (v0.strVal === v1.strVal)? TypeSet.true:TypeSet.false;
    }

    // If both values are known booleans
    else if (
        (v0.flags === TypeFlags.TRUE || v0.flags === TypeFlags.FALSE) &&
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
*/

// TODO
/*
// Operator !=
JSNeInstr.prototype.mozTI = function (ta, typeGraph)
{
    var v0 = typeGraph.getType(this.uses[0]);
    var v1 = typeGraph.getType(this.uses[1]);

    // Output type
    var outType = TypeSet.bool;

    // If the type flags are mutually exclusive,
    // the values cannot be equal
    if (v0.flags & v1.flags === 0)
    {
        outType = TypeSet.false;
    }

    // If both values are numbers and their ranges are mutually exclusive
    else if (
        (v0.flags === TypeFlags.INT || v0.flags === TypeFlags.FLOAT) &&
        (v1.flags === TypeFlags.INT || v1.flags === TypeFlags.FLOAT))
    {
        // If the ranges are mutually exclusive
        if (v0.rangeMax < v1.rangeMin || v1.rangeMax < v0.rangeMin)
            outType = TypeSet.true;

        // If the values are equal
        else if (v0.rangeMin === v0.rangeMax && 
                 v1.rangeMin === v1.rangeMax &&
                 v0.rangeMin === v1.rangeMin)
            outType = TypeSet.false;
    }

    // If both values are known strings
    else if (
        v0.flags === TypeFlags.STRING && v1.flags === TypeFlags.STRING &&
        v0.strVal !== undefined && v1.strVal !== undefined)
    {
        outType = (v0.strVal !== v1.strVal)? TypeSet.true:TypeSet.false;
    }

    ta.setOutput(typeGraph, this, outType);
}
*/

// TODO
/*
// Operator !==
JSNsInstr.prototype.mozTI = function (ta, typeGraph)
{
    var v0 = typeGraph.getType(this.uses[0]);
    var v1 = typeGraph.getType(this.uses[1]);

    // Output type
    var outType = TypeSet.bool;

    // If the type flags are mutually exclusive,
    // the values cannot be equal
    if (v0.flags & v1.flags === 0)
    {
        outType = TypeSet.false;
    }

    // If both values are numbers and their ranges are mutually exclusive
    else if (
        (v0.flags === TypeFlags.INT || v0.flags === TypeFlags.FLOAT) &&
        (v1.flags === TypeFlags.INT || v1.flags === TypeFlags.FLOAT))
    {
        // If the ranges are mutually exclusive
        if (v0.rangeMax < v1.rangeMin || v1.rangeMax < v0.rangeMin)
            outType = TypeSet.true;

        // If the values are equal
        else if (v0.rangeMin === v0.rangeMax && 
                 v1.rangeMin === v1.rangeMax &&
                 v0.rangeMin === v1.rangeMin)
            outType = TypeSet.false;
    }

    // If both values are known strings
    else if (
        v0.flags === TypeFlags.STRING && v1.flags === TypeFlags.STRING &&
        v0.strVal !== undefined && v1.strVal !== undefined)
    {
        outType = (v0.strVal !== v1.strVal)? TypeSet.true:TypeSet.false;
    }

    ta.setOutput(typeGraph, this, outType);
}
*/

// TODO
/*
JumpInstr.prototype.mozTI = function (ta, typeGraph)
{
    ta.succMerge(this.targets[0], typeGraph);
}
*/

// TODO
/*
// If branching instruction
IfInstr.prototype.mozTI = function (ta, typeGraph)
{
    var v0 = typeGraph.getType(this.uses[0]);
    var v1 = typeGraph.getType(this.uses[1]);
    var v2 = (this.uses.length > 2)? typeGraph.getType(this.uses[1]):undefined;

    var instr = this;

    // Function to merge a value type in a given successor block
    function mergeVal(val, type, target)
    {
        // If this is a constant, do nothing
        if (val instanceof IRConst)
            return;

        // Remove the left value from the normal merge
        typeGraph.remVar(val);

        // Get the target block graph
        var targetDesc = new BlockDesc(target);
        var targetGraph = ta.getTypeGraph(targetDesc);

        // If the successor has no type graph yet
        if (targetGraph === HashMap.NOT_FOUND)
        {
            // Pass a copy of the predecessor graph to the successor
            var targetGraph = typeGraph.copy(true, true);
            ta.setTypeGraph(targetDesc, targetGraph);
        }

        var curType = targetGraph.getType(val);
        var mergedType = curType.union(type);

        // If the type changed
        if (curType.equal(mergedType) === false)
        {
            targetGraph.unionType(val, mergedType);
            ta.queueBlock(targetDesc);
        }
    }

    // Function to handle the successor queuing for a given branch
    function mergeSuccs(boolVal)
    {
        var trueTarget = instr.targets[0];
        var falseTarget = instr.targets[1];

        // If we can potentially narrow the comparison input types
        if (instr.testOp === 'EQ' && 
            v1.flags === TypeFlags.TRUE &&
            instr.uses[0] instanceof JSCompInstr)
        {
            var compInstr = instr.uses[0];

            var lVal = compInstr.uses[0];
            var rVal = compInstr.uses[1];

            var lType = typeGraph.getType(lVal);
            var rType = typeGraph.getType(rVal);

            var trueLType = lType;
            var falseLType = rType;
            
            // Less-than comparison
            if (compInstr instanceof JSLtInstr)
            {
                //print(lType + ' < ' + rType);

                // If both values are integer
                if (lType.flags === TypeFlags.INT && rType.flags === TypeFlags.INT)
                {
                    // lVal < rVal
                    var rangeMax = Math.min(lType.rangeMax, rType.rangeMax - 1);
                    var rangeMin = Math.min(lType.rangeMin, rangeMax);
                    var trueLType = new TypeSet(
                        TypeFlags.INT,
                        rangeMin,
                        rangeMax
                    );

                    // lVal >= rVal
                    var rangeMin = Math.max(lType.rangeMin, rType.rangeMin);
                    var rangeMax = Math.max(lType.rangeMax, rangeMin);
                    var falseLType = new TypeSet(
                        TypeFlags.INT,
                        rangeMin,
                        rangeMax
                    );
                }
            }

            if (boolVal === true || boolVal === undefined)
                mergeVal(lVal, trueLType, trueTarget);
            if (boolVal === false || boolVal === undefined)
                mergeVal(lVal, falseLType, falseTarget);
        }

        // Merge with the successor blocks
        if (boolVal === true || boolVal === undefined)
            ta.succMerge(trueTarget, typeGraph);
        if (boolVal === false || boolVal === undefined)
            ta.succMerge(falseTarget, typeGraph);
    }

    // If this is an equality comparison
    if (this.testOp === 'EQ')
    {
        if ((v0.flags === TypeFlags.TRUE && v1.flags === TypeFlags.TRUE) ||
            (v0.flags === TypeFlags.FALSE && v1.flags === TypeFlags.FALSE))
            return mergeSuccs(true);

        if ((v0.flags === TypeFlags.FALSE && v1.flags === TypeFlags.TRUE) ||
            (v0.flags === TypeFlags.TRUE && v1.flags === TypeFlags.FALSE))
            return mergeSuccs(false);
    }

    // Merge with both possible branch targets
    mergeSuccs();
}
*/

// TODO
/*
JSCallInstr.prototype.mozTI = function (ta, typeGraph)
{
    // Get the type set for the callee
    var calleeType = typeGraph.getType(this.uses[0]);

    // If the callee is unknown or non-function
    if (calleeType.flags === TypeFlags.ANY || 
        (calleeType.flags & TypeFlags.FUNCTION) === 0)
    {
        if (config.verbosity >= log.DEBUG)
            print('*WARNING: callee has type ' + calleeType);

        ta.setOutput(typeGraph, this, TypeSet.any);

        // Don't stop the inference for this block
        return false;
    }

    // Test if this is a new/constructor call
    var isNew = this instanceof JSNewInstr;

    // If this is a regular function call
    if (isNew === false)
    {
        // Get the this argument call
        var thisType = typeGraph.getType(this.uses[1]);
    }
    else
    {
        // Lookup the "prototype" property of the callee
        var protoType = ta.propLookup(typeGraph, calleeType, 'prototype', 0);

        // If the prototype may not be an object
        if (protoType.flags & (~TypeFlags.EXTOBJ))
        {
            // Exclude non-objects and include the object prototype object
            protoType = protoType.restrict(protoType.flags & (~TypeFlags.EXTOBJ));
            protoType = protoType.union(ta.objProto);
        }

        // Create a new object to use as the this argument
        var thisType = typeGraph.newObject(this, protoType);
    }

    // Get a descriptor for the continuation block
    if (this.targets[0] instanceof BasicBlock)
    {
        // Use the continuation target
        var contDesc = new BlockDesc(this.targets[0]);
    }
    else
    {
        // The continuation is the rest of the caller block
        var instrIdx = this.parentBlock.instrs.indexOf(this);
        var contDesc = new BlockDesc(this.parentBlock, instrIdx + 1);
    }

    // Get the type graph for the continuation
    var contGraph = ta.getTypeGraph(contDesc);

    // Merge the continuation graph with the current type graph
    if (contGraph === HashMap.NOT_FOUND)
        var newContGraph = typeGraph.copy(true, false);
    else
        var newContGraph = contGraph.merge(typeGraph, true, false);

    // Restrict the callee type in the continuation to functions
    var newCalleeType = calleeType.restrict(TypeFlags.FUNCTION);        
    newContGraph.assignType(this.uses[0], newCalleeType);

    // Flag to indicate a potential callee has been analyzed
    var calleeAnalyzed = false;

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

        // Get a descriptor for the entry block
        var entryDesc = new BlockDesc(funcInfo.entry);

        // Get the type graph at the function entry
        var entryGraph = ta.getTypeGraph(entryDesc);

        // Merge the entry graph with the current type graph
        if (entryGraph === HashMap.NOT_FOUND)
            var newEntryGraph = typeGraph.copy(false, true);
        else
            var newEntryGraph = entryGraph.merge(typeGraph, false, true);

        // Get the type set for this callee function
        var funcType = new TypeSet(
            callee.flags, 
            undefined, 
            undefined, 
            undefined, 
            callee
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
                    (useIdx < this.uses.length)?
                    typeGraph.getType(this.uses[useIdx]):
                    TypeSet.undef;
            }

            // Union the type for this argument
            newEntryGraph.unionType(argNode, argTypeSet);
        }

        // If this function uses the arguments object
        if (func.usesArguments === true)
        {
            // For each argument of this call (excluding the function and this)
            for (var i = (isNew? 1:2); i < this.uses.length; ++i)
            {
                // Union the argument type into the indexed argument type
                var argType = typeGraph.getType(this.uses[i]);
                newEntryGraph.unionType(funcInfo.idxArgNode, argType);
            }
        }

        // If the entry graph changed
        if (entryGraph === HashMap.NOT_FOUND || 
            newEntryGraph.equal(entryGraph) === false)
        {
            // Update the entry graph
            ta.setTypeGraph(entryDesc, newEntryGraph);

            // Queue the function for analysis
            ta.queueFunc(func);
        }

        // Add this instruction to the set of callers
        if (funcInfo.callerSet.has(this) === false)
        {
            funcInfo.callerSet.add(this);
            funcInfo.callerList.push(this);
        }

        // Set the call type flags
        if (isNew === true)
            funcInfo.ctorCall = true;
        else
            funcInfo.normalCall = true;

        // Get the return graph for the callee
        var retGraph = funcInfo.retGraph;

        // If there is a return graph for the callee
        if (retGraph !== undefined)
        {
            // At least one callee has been analyzed
            calleeAnalyzed = true;

            // Merge the return graph into the continuation graph
            newContGraph = newContGraph.merge(retGraph, false, true);

            // Get the return type for this call
            var retType = retGraph.getType(funcInfo.retNode);

            // If this is a regular call
            if (isNew === false)
            {
                newContGraph.unionType(this, retType);
            }
            else
            {
                var callRetType = TypeSet.empty;

                // If the return type may be undefined
                if (retType.flags & TypeFlags.UNDEF)
                {
                    // Union the "this" argument type
                    callRetType = callRetType.union(thisType);
                }

                // If the return type may be not undefined
                if (retType.flags !== TypeFlags.UNDEF)
                {
                    // Union all but undefined
                    callRetType = callRetType.union(retType.restrict(
                        retType.flags & ~TypeFlags.UNDEF
                    ));
                }

                newContGraph.unionType(this, callRetType);
            }
        }
    }

    // If the continuation graph changed
    if (contGraph === HashMap.NOT_FOUND || 
        newContGraph.equal(contGraph) === false)
    {
        // Update the continuation graph
        ta.setTypeGraph(contDesc, newContGraph);

        // If at least one potential callee has been analyzed
        if (calleeAnalyzed === true)
        {


            if (newContGraph.objSet.length === 0)
                error('cont graph obj set size 0 and queing call succ *********');


            // Queue the continuation for analysis
            ta.queueBlock(contDesc);
        }
    }

    // Stop the inference for this block
    return true;
}
*/

// TODO
/*
// New/constructor call instruction
// Handled by the same function as the regular call instruction
JSNewInstr.prototype.mozTI = JSCallInstr.prototype.mozTI;
*/

// TODO
/*
ArgValInstr.prototype.mozTI = function (ta, typeGraph)
{
    // Get the info object for this function
    var func = this.parentBlock.parentCFG.ownerFunc;
    var funcInfo = ta.getFuncInfo(func);

    var argNode = funcInfo.argNodes[this.argIndex];
    var argTypeSet = typeGraph.getType(argNode);

    typeGraph.assignType(this, argTypeSet);
}
*/

// TODO
/*
RetInstr.prototype.mozTI = function (ta, typeGraph)
{
    // Get the return type
    var retType = typeGraph.getType(this.uses[0]);

    // Get the info object for this function
    var func = this.parentBlock.parentCFG.ownerFunc;
    var funcInfo = ta.getFuncInfo(func);
 
    // Get the return point graph
    var retGraph = funcInfo.retGraph;

    // Merge the current type graph into the return graph
    if (retGraph === undefined)
        var newRetGraph = typeGraph.copy(false, true);
    else
        var newRetGraph = retGraph.merge(typeGraph, false, true);

    // Merge the return type
    newRetGraph.unionType(funcInfo.retNode, retType);

    // If the return graph changed
    if (retGraph === undefined || newRetGraph.equal(retGraph) === false)
    {
        // Update the return graph
        funcInfo.retGraph = newRetGraph;
    }
    else
    {
        // Stop here, do not re-queue the callers
        return;
    }

    // If this is a unit-level function
    if (funcInfo.nextUnit !== undefined)
    {
        // The continuation is the next unit's entry
        var contDesc = new BlockDesc(funcInfo.nextUnit.entry);

        // Get the current continuation type graph
        var contGraph = ta.getTypeGraph(contDesc);

        // Copy the return graph for the next unit
        var nextGraph = newRetGraph.copy(false, true);

        // If the continuation graph changed
        if (contGraph === HashMap.NOT_FOUND ||
            nextGraph.equal(contGraph) === false)
        {
            // Queue the continuation block for analysis
            ta.setTypeGraph(contDesc, nextGraph);
            ta.queueBlock(contDesc);
        }
    }

    // Otherwise, this is a regular function
    else
    {
        // For each caller
        for (var i = 0; i < funcInfo.callerList.length; ++i)
        {
            var callInstr = funcInfo.callerList[i];
            var callerBlock = callInstr.parentBlock;

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

            // Get the current type graph for the continuation
            var contGraph = ta.getTypeGraph(contDesc);

            // Merge the return graph into the continuation graph
            var newContGraph = contGraph.merge(newRetGraph, false, true);

            // If this is a regular call instruction
            if (callInstr instanceof JSCallInstr)
            {
                // Set the return type for the call instruction
                newContGraph.unionType(callInstr, retType);
            }

            // Otherwise, this is a constructor call
            else
            {
                var newType = TypeSet.empty;

                // If the return type may be undefined
                if (retType.flags & TypeFlags.UNDEF)
                {
                    // Union the "this" argument type
                    var thisType = typeGraph.getType(funcInfo.argNodes[1]);
                    newType = newType.union(thisType);
                }

                // If the return type may be not undefined
                if (retType.flags !== TypeFlags.UNDEF)
                {
                    // Union all but undefined
                    newType = newType.union(retType.restrict(
                        retType.flags & ~TypeFlags.UNDEF
                    ));
                }

                // Set the return type for the new instruction
                newContGraph.unionType(callInstr, newType);
            }

            // If the continuation graph changed
            if (newContGraph.equal(contGraph) === false)
            {
                // Queue the continuation block for analysis
                ta.setTypeGraph(contDesc, newContGraph);
                ta.queueBlock(contDesc);
            }
        }
    }
}
*/

// TODO
/*
// LIR call instruction
CallFuncInstr.prototype.mozTI = function (ta, typeGraph)
{
    var callee = this.uses[0];

    // Return type (by default, any type)
    var retType = TypeSet.any;

    // If we cannot determine the callee
    if ((callee instanceof IRFunction) === false)
    {
        // Do nothing
    }

    // Creates the 'arguments' object
    else if (callee.funcName === 'makeArgObj')
    {
        // Get the argument type info for this function
        var func = this.parentBlock.parentCFG.ownerFunc;
        var funcInfo = ta.getFuncInfo(func);

        // Create the arguments object
        var argObjType = typeGraph.newObject(this, ta.objProto);
        var argObj = argObjType.getObjItr().get();

        // Set the arguments length value
        var lengthNode = argObj.getPropNode('length');
        typeGraph.assignType(lengthNode, TypeSet.posInt);

        // Set the indexed property type
        var idxArgType = typeGraph.getType(funcInfo.idxArgNode);
        typeGraph.assignType(argObj.idxProp, idxArgType);

        retType = argObjType;
    }

    // Closure object creation
    else if (callee.funcName === 'makeClos')
    {
        var func = this.uses[3];
        var numClosCells = this.uses[4].value;

        //print(this);

        assert (
            func instanceof IRFunction,
            'closure of unknown function'
        );

        assert (
            isNonNegInt(numClosCells),
            'invalid num clos cells'
        );

        // Create an object node for this function
        var funcObj = typeGraph.newObject(
            func, 
            ta.funcProto, 
            TypeFlags.FUNCTION, 
            numClosCells
        );

        // If this is a global library function
        if (ta.fromLib(func) === true)
        {
            // Try to find the right prototype object
            var protoObj;
            switch (func.funcName)
            {
                case 'Object'   : protoObj = ta.objProto; break;
                case 'Array'    : protoObj = ta.arrProto; break;
                case 'Function' : protoObj = ta.funcProto; break;
                case 'String'   : protoObj = ta.strProto; break;
            }
        }

        // If no prototype object exists
        if (protoObj === undefined)
        {
            // Test if this is a global function
            var curFunc = this.parentBlock.parentCFG.ownerFunc;
            var globalFunc = curFunc.parentFunc === null;

            // Create a Function.prototype object for the function
            var protoObj = typeGraph.newObject(
                this, 
                ta.objProto,
                undefined,
                undefined,
                globalFunc
            );
        }

        // Assign the prototype object to the Function.prototype property
        var protoNode = funcObj.getObjItr().get().getPropNode('prototype');
        typeGraph.assignType(protoNode, protoObj);

        retType = funcObj;
    }

    // Closure cell creation
    else if (callee.funcName === 'makeCell')
    {
        //print('makeCell');
        //print(this);

        var newCell = new TGClosCell(this);

        var cellType = new TypeSet(
            TypeFlags.CELL,
            undefined,
            undefined,
            undefined,
            newCell
        );

        retType = cellType;
    }

    // Set closure cell variable
    else if (callee.funcName === 'set_clos_cells')
    {
        var closType = typeGraph.getType(this.uses[3]);
        var cellIdx = this.uses[4].value;
        var valType = typeGraph.getType(this.uses[5]);

        //print(this);

        assert (
            closType.flags === TypeFlags.FUNCTION,
            'invalid closure type'
        );

        // For each possible closure
        for (var itr = closType.getObjItr(); itr.valid(); itr.next())
        {
            var clos = itr.get();

            assert (
                cellIdx < clos.closVars.length,
                'invalid clos var index: ' + cellIdx + 
                ' (' + clos.closVars.length + ')'
            );

            var varNode = clos.closVars[cellIdx];
            typeGraph.unionType(varNode, valType);
        }
    }

    // Get closure cell variable
    else if (callee.funcName === 'get_clos_cells')
    {
        var closType = typeGraph.getType(this.uses[3]);
        var cellIdx = this.uses[4].value;

        //print('get_clos_cells ******');

        assert (
            closType.flags === TypeFlags.FUNCTION,
            'invalid closure type'
        );

        var outType = TypeSet.empty;

        // For each possible closure
        for (var itr = closType.getObjItr(); itr.valid(); itr.next())
        {
            var clos = itr.get();

            assert (
                cellIdx < clos.closVars.length,
                'invalid clos var index: ' + cellIdx + 
                ' (' + clos.closVars.length + ')'
            );

            var varNode = clos.closVars[cellIdx];
            var varType = typeGraph.getType(varNode);

            outType = outType.union(varType);
        }

        retType = outType;
    }

    // Set closure cell value
    else if (callee.funcName === 'set_cell_val')
    {
        var cellType = typeGraph.getType(this.uses[3]);
        var valType = typeGraph.getType(this.uses[4]);

        //print('set_cell_val');
        //print(this);

        assert (
            cellType.flags === TypeFlags.CELL,
            'invalid cell type: ' + cellType
        );

        // For each possible cell
        for (var itr = cellType.getObjItr(); itr.valid(); itr.next())
        {
            var cell = itr.get();

            var varNode = cell.value;
            typeGraph.unionType(varNode, valType);
        }
    }

    // Get closure cell value
    else if (callee.funcName === 'get_cell_val')
    {
        var cellType = typeGraph.getType(this.uses[3]);

        //print('get_cell_val');
        //print(this);

        // If the cell type is not unknown
        if (cellType.flags !== TypeFlags.ANY)
        {
            assert (
                cellType.flags === TypeFlags.CELL,
                'invalid closure cell type: ' + cellType
            );

            var outType = TypeSet.empty;

            // For each possible cell
            for (var itr = cellType.getObjItr(); itr.valid(); itr.next())
            {
                var cell = itr.get();
                var varType = typeGraph.getType(cell.value);

                outType = outType.union(varType);
            }

            retType = outType;
        }
    }

    // Box an integer
    else if (callee.funcName === 'boxInt')
    {
        retType = TypeSet.posInt;
    }

    // Box value to string conversion
    else if (callee.funcName === 'boxToString')
    {
        var valType = typeGraph.getType(this.uses[2]);

        if (valType.flags === TypeFlags.STRING)
            retType = valType;
        else
            retType = TypeSet.string;
    }

    // Unknown primitive
    else
    {
        //print('unknown primitive: ' + callee.funcName);
    }

    // Set our own output type in the type graph
    ta.setOutput(typeGraph, this, retType);

    // Merge with all possible branch targets
    for (var i = 0; i < this.targets.length; ++i)
        ta.succMerge(this.targets[i], typeGraph);
}
*/


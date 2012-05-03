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
Sparse Path-Sensitive Type Flow (SPSTF) analysis implementation.

@author
Maxime Chevalier-Boisvert
*/

/*
TODO
Try to minimize hash table lookups

Phi instrs must make sure to have in-edges for all reachable *edges*
  - Edges, not preds!

How do we deal with function calls and returns? **********
- Probably want SPSTFFunc object, so we can think in terms of call graphs
- Type flow edges for ArgValInstr go to corresponding definitions directly???
  - Need to tell the ArgValInstr what type sets (values) to fetch
  - Special method for this *****
- Same for returns, tell the calls instrs what type sets to fetch
  - Special method for this *****

TODO: Object does not exist in one branch, how do we keep track of this? How do we merge?
- If you can't reach a prop type set on a given path, the object doesn't exist on that path
  - Resolves to initDefs, gives empty set
- Objects need to create undefined type sets for their properties at the creation site******
*/

/**
@class Set of live value uses
*/
function SPSTFUseSet()
{
    HashSet.call(this, undefined, undefined, 3);
}
SPSTFUseSet.prototype = Object.create(HashSet.prototype);

SPSTFUseSet.prototype.union = function (that)
{
    if (this === that)
        return this;

    var newSet = this.copy();

    return HashSet.prototype.union.call(newSet, that);
}

SPSTFUseSet.prototype.add = function (use)
{
    var newSet = this.copy();

    HashSet.prototype.add.call(newSet, use);

    return newSet;
}

/**
Empty use set
*/
SPSTFUseSet.empty = new SPSTFUseSet();

/**
@class Map of live values to their future uses
*/
function SPSTFLiveMap()
{
    HashMap.call(this, undefined, undefined, 3);
}
SPSTFLiveMap.prototype = Object.create(HashMap.prototype);

SPSTFLiveMap.prototype.copy = function ()
{
    var newMap = new SPSTFLiveMap();

    for (var itr = this.getItr(); itr.valid(); itr.next())
    {
        var pair = itr.get();
        var val = pair.key;
        var set = pair.value;

        // Use sets do copy on write and so they are not copied here
        newMap.set(val, set);
    }

    return newMap;
}

SPSTFLiveMap.prototype.equal = function (that)
{
    if (this.length !== that.length)
        return false;

    for (var itr = this.getItr(); itr.valid(); itr.next())
    {
        var pair = itr.get();
        var val = pair.key;
        var setA = pair.value;

        var setB = that.get(val);

        if (setA.equal(setB) === false)
            return false;
    }

    return true;
}

SPSTFLiveMap.prototype.union = function (that)
{
    var newMap = this.copy();

    for (var itr = that.getItr(); itr.valid(); itr.next())
    {
        var pair = itr.get();
        var val = pair.key;
        var setB = pair.value;

        var setA = this.get(val);

        // Union the use sets
        var newSet = setA.union(setB);

        newMap.set(val, newSet);
    }

    return newMap;
}

/**
Add a use for a given value
*/
SPSTFLiveMap.prototype.addLive = function (value, use)
{
    var origSet = this.get(value);

    var newSet = origSet.add(use);

    this.set(value, newSet);
}

/**
Kill the uses for a given value
*/
SPSTFLiveMap.prototype.killLive = function (value)
{
    this.rem(value);
}

/**
Get the use set for a given value
*/
SPSTFLiveMap.prototype.get = function (value)
{
    var set = HashMap.prototype.get.call(this, value);

    if (set === HashMap.NOT_FOUND)
        return SPSTFUseSet.empty;

    return set;
}

/**
@class Basic block stump
*/
function SPSTFStump(block, instrIdx)
{
    assert (
        block instanceof BasicBlock,
        'invalid basic block'
    );

    if (instrIdx === undefined)
        instrIdx = 0;

    this.block = block;

    this.instrIdx = instrIdx;
}

/**
Hash function for block descriptors
*/
SPSTFStump.hashFn = function (s)
{
    return defHashFunc(s.block) + s.instrIdx;
}

/**
Equality function for block descriptors
*/
SPSTFStump.equalFn = function (s1, s2)
{
    return s1.block === s2.block && s1.instrIdx === s2.instrIdx;
}

/**
@class Function representation for the SPSTF analysis
*/
function SPSTFFunc(irFunc)
{
    assert (
        irFunc === null || irFunc instanceof IRFunction,
        'invalid function object'
    );

    // Get the number of named parameters
    var numParams = irFunc? (irFunc.argVars.length + 2):0;

    // Create the argument value lists
    var argVals = new Array(numParams);
    for (var i = 0; i < argVals.length; ++i)
        argVals[i] = [];

    /**
    Original IR function
    */
    this.irFunc = irFunc;

    /**
    Entry block
    */
    this.entry = undefined;

    /**
    List of return blocks
    */
    this.retBlocks = [];

    /**
    List of call sites (SPSTFInstr instances)
    */
    this.callSites = [];

    /**
    List of argument value instructions
    */
    this.argInstrs = new Array(numParams);

    /**
    List of lists of argument values
    */
    this.argVals = argVals;

    /**
    List of argument values for the arguments object
    */
    this.idxArgVals = [];

    /**
    List of values returned by the function
    */
    this.retVals = [];

    /**
    List of values defined in this function or callees
    */
    this.defSet = new HashSet();

    /**
    Flag indicating this function has been called in a normal call
    */
    this.normalCall = false;

    /**
    Flag indicating this function has been called as a constructor
    */
    this.ctorCall = false;
}

SPSTFFunc.prototype.getName = function ()
{
    if (this.irFunc instanceof IRFunction)
        return this.irFunc.funcName;

    return 'null function';
}

/**
@class Basic block representation for the SPSTF analysis
*/
function SPSTFBlock(irBlock, instrIdx, func)
{
    assert (
        irBlock === null || irBlock instanceof BasicBlock,
        'invalid block object'
    );

    assert (
        isNonNegInt(instrIdx) === true,
        'invalid instr index'
    );

    assert (
        func === null || func instanceof SPSTFFunc,
        'invalid function object'
    );

    this.irBlock = irBlock;

    this.instrIdx = instrIdx;

    this.func = func;

    this.preds = [];

    this.instrs = [];

    /**
    Map of live values to uses at the beginning of the block
    */
    this.liveMap = new SPSTFLiveMap();
}

SPSTFBlock.prototype.getName = function ()
{
    if (this.irBlock instanceof BasicBlock)
        return this.irBlock.getBlockName();

    return 'null block';
}

/**
@class Instruction representation for the SPSTF analysis
*/
function SPSTFInstr(irInstr, instrIdx, block)
{
    assert (
        irInstr instanceof IRInstr,
        'invalid instr object'
    );

    assert (
        isNonNegInt(instrIdx) === true,
        'invalid instr index'
    );

    assert (
        block instanceof SPSTFBlock,
        'invalid block object'
    );

    /**
    Original IRInstr instance
    */
    this.irInstr = irInstr;

    /**
    SPSTFBlock instance this instruction belongs to
    */
    this.block = block;

    /**
    Flow function for this instruction
    */
    this.flowFunc = irInstr.spstfFlowFunc;

    /**
    List of target blocks
    */
    this.targets = undefined;

    /**
    Input value list.
    List of objects specifying the value and sources.
        {
            value,
            srcs: []
            {
                instr
                targetIdx
                outIdx
            }
        }
    */
    this.inVals = [];

    /**
    Output value list.
    List of lists (one per target) of objects specifying
    the defined value, type and destinations.
        {
            value,
            type,
            dests: []
        }
    */
    this.outVals = undefined;

    // If this is a call instruction
    if (irInstr instanceof JSCallInstr || irInstr instanceof JSNewInstr)
    {
        // Add a field for the list of callees
        this.callees = [];
    }

    // If the instruction has targets
    if (irInstr.targets.length > 0)
    {
        this.targets = new Array(irInstr.targets.length);

        for (var i = 0; i < this.targets.length; ++i)
            this.targets[i] = new SPSTFStump(irInstr.targets[i]);
    }

    // If this is a call instruction with no explicit targets
    else if ((irInstr instanceof JSCallInstr || irInstr instanceof JSNewInstr) &&
             irInstr.parentBlock instanceof BasicBlock)
    {
        this.targets = [new SPSTFStump(irInstr.parentBlock, instrIdx + 1)];
    }

    // There are no targets
    else
    {
        this.targets = [];
    }

    // Create the per-branch definitions list
    this.outVals = new Array((this.targets.length > 0)? this.targets.length:1);
    for (var i = 0; i < this.outVals.length; ++i)
        this.outVals[i] = [];
}

/**
@class Sparse Path-Sensitive Type Flow (SPSTF) Analysis
@extends TypeAnalysis
*/
function SPSTF()
{
    // Initialize the type analysis
    this.init();
}
SPSTF.prototype = new TypeAnalysis();

/**
Initialize/reset the analysis
*/
SPSTF.prototype.init = function ()
{
    // Clear the object map
    TGObject.objMap.clear();

    // Clear the closure cell map
    TGClosCell.cellMap.clear();

    /**
    Work list of instructions queued for type flow analysis
    */
    this.instrWorkList = new LinkedList();

    /**
    Set of instructions in the instruction work list
    This is to avoid adding instructions to the work list twice
    */
    this.instrWorkSet = new HashSet();

    /**
    Work list of blocks queued for live value analysis
    */
    this.blockWorkList = new LinkedList();

    /**
    Set of block in the block work list
    This is to avoid adding blocks to the work list twice
    */
    this.blockWorkSet = new HashSet();

    /**
    Map of block stumps to basic block representations
    */
    this.blockMap = new HashMap(SPSTFStump.hashFn, SPSTFStump.equalFn);

    /**
    Map of IR functions to function representations
    */
    this.funcMap = new HashMap();

    /**
    Total number of type flow edges
    */
    this.numEdges = 0;

    // Create a meta-unit to hold initial definitions and unit calls
    var metaUnit = new SPSTFFunc(null);
    var metaEntry = new SPSTFBlock(null, 0, metaUnit)
    metaUnit.entry = metaEntry;

    // Create the instruction holding the initial definitions
    var initInstr = this.makeInstr(Object.create(JumpInstr.prototype), metaEntry);

    /**
    Meta-unit holding the initial instruction and unit calls
    */
    this.metaUnit = metaUnit;

    /**
    Pseudo-instruction holding initial definitions
    */
    this.initInstr = initInstr;

    /**
    Last meta-unit block added
    */
    this.lastMetaBlock = metaEntry;

    /**
    Object prototype object node
    */
    this.objProto = this.newObject(
        initInstr,
        'obj_proto', 
        undefined, 
        undefined, 
        undefined, 
        true
    );

    /**
    Array prototype object node
    */
    this.arrProto = this.newObject(
        initInstr,
        'arr_proto', 
        this.objProto, 
        undefined, 
        undefined, 
        true
    );

    /**
    Function prototype object node
    */
    this.funcProto = this.newObject(
        initInstr,
        'func_proto', 
        this.objProto,
        undefined, 
        undefined, 
        true
    );

    /**
    String prototype object node
    */
    this.strProto = this.newObject(
        initInstr,
        'str_proto', 
        this.objProto,
        undefined, 
        undefined, 
        true
    );

    /**
    Global object node
    */
    this.globalObj = this.newObject(
        initInstr,
        'global', 
        this.objProto, 
        undefined,
        undefined, 
        true
    );

    // TODO
    // TODO: handle type assertions
    // TODO

    /**
    Instruction iteration count
    */
    this.itrCount = 0;

    /**
    Block iteration count
    */
    this.blockItrCount = 0;

    /**
    Total analysis time
    */
    this.totalTime = 0;
}

/**
Dump information gathered about functions during analysis
*/
SPSTF.prototype.dumpFunctions = function ()
{
    // TODO
}

/**
Dump information gathered about objects during analysis
*/
SPSTF.prototype.dumpObjects = function ()
{
    // TODO
}

/**
Compute statistics about type sets
*/
SPSTF.prototype.compTypeStats = function ()
{
    // TODO
}

/**
Evaluate type assertions, throw an exception if any fail
*/
SPSTF.prototype.evalTypeAsserts = function ()
{
    // For now, do nothing. The type assertions are representative
    // of the capabilities of the type propagation analysis.
    // TODO
}

/**
Create an SPSTFInstr instance and add it to a block
*/
SPSTF.prototype.makeInstr = function (irInstr, block, instrIdx)
{
    if (instrIdx === undefined)
        instrIdx = block.instrs.length;

    var instr = new SPSTFInstr(irInstr, instrIdx, block);

    block.instrs.push(instr);

    // Queue the instruction for analysis
    this.queueInstr(instr);

    return instr;
}

/**
Get the SPSTFBlock instance for a given block stump
*/
SPSTF.prototype.getBlock = function (stump, func)
{
    assert (
        func === null || func instanceof SPSTFFunc,
        'invalid function object'
    );

    // Check if a representation has already been created for this block
    var block = this.blockMap.get(stump);

    // If no representation has yet been created
    if (block === HashMap.NOT_FOUND)
    {
        // Construct the block representation
        var block = new SPSTFBlock(stump.block, stump.instrIdx, func);

        // For each instruction
        for (var i = stump.instrIdx; i < stump.block.instrs.length; ++i)
        {
            var irInstr = stump.block.instrs[i];

            // Create the instruction object and add it to the block
            var instr = this.makeInstr(irInstr, block, i);

            // If this is a call/new instruction, stop. Remaining
            // instructions will be in a continuation block.
            if (irInstr instanceof JSCallInstr || irInstr instanceof JSNewInstr)
                break;

            // If this is a return instruction
            if (irInstr instanceof RetInstr)
            {
                // Add this block to the list of return blocks for the function
                func.retBlocks.push(block);
            }

            // If this is an argument value instruction
            else if (irInstr instanceof ArgValInstr)
            {
                var argIndex = irInstr.argIndex;

                assert (
                    func.argInstrs[argIndex] === undefined,
                    'already have ArgValInstr for index'
                );

                // Store the instruction on the function object
                func.argInstrs[argIndex] = instr;
            }
        }

        // Queue the block for live value analysis
        this.queueBlock(block);
    }

    // Return block representation
    return block;
}

/**
Get the SPSTFBlock instance for a given IR function
*/
SPSTF.prototype.getFunc = function (irFunc)
{
    assert (
        irFunc instanceof IRFunction,
        'expected IR function'
    );

    // Check if a representation has already been created for this function
    var func = this.funcMap.get(irFunc);

    // If no representation has yet been created
    if (func === HashMap.NOT_FOUND)
    {
        // Construct function representation
        var func = new SPSTFFunc(irFunc, 0, func);

        // Queue the function's entry block
        var entry = this.getBlock(new SPSTFStump(irFunc.hirCFG.entry), func);

        // Set the function entry block
        func.entry = entry;

        // Add the function to the function map
        this.funcMap.set(irFunc, func);
    }

    // Return the function representation
    return func;
}

/**
Queue an instruction for type flow analysis
*/
SPSTF.prototype.queueInstr = function (instr)
{
    assert (
        instr instanceof SPSTFInstr,
        'invalid instruction object'
    );

    // TODO: test if the work set helps the performance at all
    // in a relatively large benchmark
    if (this.instrWorkSet.has(instr) === true)
        return;

    this.instrWorkList.addLast(instr);
    this.instrWorkSet.add(instr);
}

/**
Queue a block for live value analysis
*/
SPSTF.prototype.queueBlock = function (block)
{
    assert (
        block instanceof SPSTFBlock,
        'invalid block object'
    );

    if (this.blockWorkSet.has(block) === true)
        return;

    this.blockWorkList.addLast(block);
    this.blockWorkSet.add(block);

    print('block queued: ' + block.getName());
}

/**
Add a code unit to the analysis
*/
SPSTF.prototype.addUnit = function (ir)
{
    assert (
        ir.astNode instanceof Program,
        'IR object is not unit-level function'
    );

    // Construct the function object and queue it for analysis
    var func = this.getFunc(ir);

    // Create a new block in the meta-unit to call into the new unit
    var callBlock = new SPSTFBlock(null, 0, this.metaUnit);

    // Create a closure for the function in the meta-unit
    var makeClosInstr = this.makeInstr(
        new CallFuncInstr(
            config.clientParams.staticEnv.getBinding('makeClos'),
            IRConst.getConst(undefined),
            IRConst.getConst(undefined),
            func.irFunc,
            IRConst.getConst(0, IRType.pint)
        ),
        callBlock
    );

    // Call the function in the meta-unit
    var callInstr = this.makeInstr(
        new JSCallInstr(
            makeClosInstr.irInstr,
            IRConst.getConst(undefined)
        ),
        callBlock
    );

    // Make the last meta-unit block branch to the new block
    var lastBlock = this.lastMetaBlock;
    var lastBranch = lastBlock.instrs[lastBlock.instrs.length-1];
    lastBranch.targets = [callBlock];

    // The new block is the last meta-unit block
    this.lastMetaBlock = callBlock;    
}

/**
Run the analysis until fixed-point is reached
*/
SPSTF.prototype.run = function ()
{
    // Start timing the analysis
    var startTimeMs = (new Date()).getTime();

    // Until a fixed point is reached
    for (;;)
    {
        if (this.instrWorkList.isEmpty() === false)
        {
            // Run one type flow analysis iteration
            this.instrItr();
        }

        else if (this.blockWorkList.isEmpty() === false)
        {
            // Run one live value analysis iteration
            this.blockItr();
        }

        // Both work lists are empty
        else
        {
            break;
        }
    }

    // Stop the timing
    var endTimeMs = (new Date()).getTime();
    var time = (endTimeMs - startTimeMs) / 1000;

    // Update the total analysis time
    this.totalTime += time;
}

/**
Run one type flow analysis iteration
*/
SPSTF.prototype.instrItr = function ()
{
    assert (
        this.instrWorkList.isEmpty() === false,
            'empty work list'
    );

    // Remove an instruction from the work list
    var instr = this.instrWorkList.remFirst();
    this.instrWorkSet.rem(instr);

    // Call the flow function for ths instruction
    instr.flowFunc(this);

    // Increment the instruction iteration count
    this.itrCount++;
}

/**
Run one live value analysis iteration
*/
SPSTF.prototype.blockItr = function ()
{
    assert (
        this.blockWorkList.isEmpty() === false,
            'empty work list'
    );

    // Remove a block from the work list
    var block = this.blockWorkList.remFirst();
    this.blockWorkSet.rem(block);

    print(
        'iterating block: ' + block.getName() +
        ((block === block.func.entry)? (' (' + block.func.getName() + ')'):'')
    );

    /* TODO: 
    Lazy propagation: if fn (or callees) doesn't define a value, don't
    propagate uses for that value though the call. 
    - Special treatment needed at returns
    - Special treatment needed at call sites
    */

    var that = this;

    /**
    Process definitions for an instruction
    */
    function processDefs(instr, liveMap, targetIdx)
    {
        // Get the definitions for this target
        var outVals = instr.outVals[targetIdx];

        // For each definition of the instruction
        for (var outIdx = 0; outIdx < outVals.length; ++outIdx)
        {
            var def = outVals[outIdx];
            var value = def.value;
            var dests = def.dests;

            // Get the uses for this value
            var useSet = liveMap.get(value);

            // For each current dest of this definition
            for (var i = 0; i < dests.length; ++i)
            {
                var dest = dests[i];

                // If the use is no longer present
                if (useSet.has(dest) === false)
                {
                    // Remove the type flow edge
                    that.addEdge(
                        value, 
                        dest, 
                        instr, 
                        outIdx, 
                        targetIdx
                    );

                    // Re-queue the dest instruction for analysis
                    that.queueInstr(dest);
                }          
            }

            // For each use in the incoming use set
            for (var itr = useSet.getItr(); itr.valid(); itr.next())
            {
                var dest = itr.get();

                // If this is a new use
                if (arraySetHas(dests, dest) === false)
                {
                    // Add a new type flow edge
                    that.addEdge(
                        value, 
                        dest, 
                        instr, 
                        outIdx, 
                        targetIdx
                    );

                    // Re-queue the dest instruction for analysis
                    that.queueInstr(dest);
                }
            }

            // Definitions kill live values
            liveMap.killLive(value);
        }
    }

    /**
    Process uses for an instruction
    */
    function processUses(instr, liveMap)
    {
        // For each use of the instruction
        for (var i = 0; i < instr.inVals.length; ++i)
        {
            var value = instr.inVals[i].value;

            // Uses generate live values
            liveMap.addLive(value, instr);
        }
    }

    // Get the branch instruction for this block
    var branch = block.instrs[block.instrs.length-1];

    // Live value map to be propagated through this block
    var liveMap = new SPSTFLiveMap();

    // If the branch is a return instruction
    if (branch.irInstr instanceof RetInstr)
    {
        // TODO: don't prop local vars
        // TODO: lazy prop

        var callSites = branch.block.func.callSites;

        for (var i = 0; i < callSites.length; ++i)
        {
            print('ret succ merge');

            var callSite = callSites[i];
            var callCont = callSite.targets[0];

            var liveOut = callCont.liveMap.copy();
            liveMap = liveMap.union(liveOut);
        }
    }

    // If the branch is a call instruction
    else if (branch.irInstr instanceof JSCallInstr ||
             branch.irInstr instanceof JSNewInstr)
    {
        // TODO: local var prop
        // TODO: lazy prop

        for (var i = 0; i < branch.callees.length; ++i)
        {
            print('call entry merge');

            var entry = branch.callees[i].entry;

            var liveOut = entry.liveMap.copy();
            liveMap = liveMap.union(liveOut);
        }
    }

    // Other kinds of branch instructions
    else
    {
        var targets = branch.targets;

        for (var targetIdx = 0; targetIdx < targets.length; ++targetIdx)
        {
            var target = targets[targetIdx];

            if (target instanceof SPSTFStump)
                continue;

            print('target merge');

            var liveOut = target.liveMap.copy();
            processDefs(branch, liveOut, targetIdx);

            liveMap = liveMap.union(liveOut);
        }
    }

    // Process uses for branch instruction
    processUses(branch, liveMap);

    // For each instruction except the last, in reverse order
    for (var i = block.instrs.length - 2; i >= 0; --i)
    {
        var instr = block.instrs[i];

        // Process defs of the instruction
        processDefs(instr, liveMap, 0);

        // Process uses of the instruction
        processUses(instr, liveMap);
    }

    // If the live map at the beginning of the block changed
    if (liveMap.equal(block.liveMap) === false)
    {
        print('queueing preds');

        block.liveMap = liveMap;

        // If this is a function entry block
        if (block === block.func.entry)
        {
            var func = block.func;

            // Queue the call site blocks
            for (var i = 0; i < func.callSites.length; ++i)
            {
                var callSite = func.callSites[i];
                this.queueBlock(callSite.block);
            }
        }
        else
        {
            // For each predecessor block
            for (var i = 0; i < block.preds.length; ++i)
            {
                var pred = block.preds[i];

                // Queue the predecessors
                this.queueBlock(pred);

                // Get the branch instruction of the predecessor block
                var branch = pred.instrs[pred.instrs.length-1];

                // If the predecessor is a call site
                if (branch instanceof JSCallInstr || brach instanceof JSNewInstr)
                {
                    // Queue all callee return sites
                    for (var j = 0; j < branch.callees.length; ++j)
                    {
                        var callee = callees[j];
                        for (var k = 0; k < callee.retBlocks.length; ++k)
                            this.queueBlock(callee.retBlocks[k]);
                    }
                }
            }
        }
    }

    // Increment the block iteration count
    this.blockItrCount++;
}

/**
Create a new object abstraction
*/
SPSTF.prototype.newObject = function (
    instr,
    origin, 
    protoSet, 
    flags, 
    numClosVars, 
    singleton
)
{   
    // By default, the prototype is null
    if (protoSet === undefined)
        protoSet = TypeSet.null;

    // By default, this is a regular object
    if (flags === undefined)
        flags = TypeFlags.OBJECT;

    // By default, no closure variables
    if (numClosVars === undefined)
        numClosVars = 0;

    // By default, not singleton
    if (singleton === undefined)
        singleton = false;

    assert (
        protoSet.flags !== TypeFlags.EMPTY,
        'invalid proto set flags'
    );

    var obj = new TGObject(
        origin,
        flags, 
        numClosVars,
        singleton
    );

    // Set the prototype set for the object
    this.setType(instr, obj.proto, protoSet);

    return new TypeSet(
        flags, 
        undefined, 
        undefined, 
        undefined, 
        obj
    );
}

/**
Add a def-use edge
*/
SPSTF.prototype.addEdge = function (
    value, 
    useInstr, 
    defInstr, 
    outIdx, 
    targetIdx
)
{
    print('Adding edge');

    var def = defInstr.outVals[targetIdx][outIdx];

    var use = undefined;
    for (var i = 0; i < useInstr.inVals.length; ++i)
    {
        if (useInstr.inVals[i].value === value)
        {
            use = useInstr.inVals[i];
            break;
        }
    }

    assert (
        use !== undefined,
        'use not found'
    );

    def.dests.push(useInstr);

    use.srcs.push(
        {
            instr: defInstr,
            targetIdx: targetIdx,
            outIdx: outIdx
        }
    );

    this.numEdges++;
}

/**
Remove a def-use edge
*/
SPSTF.prototype.remEdge = function (
    value, 
    useInstr, 
    defInstr, 
    outIdx,
    targetIdx
)
{
    print('Removing edge');

    var def = defInstr.outVals[targetIdx][outIdx];

    var use = undefined;
    for (var i = 0; i < useInstr.inVals.length; ++i)
    {
        if (useInstr.inVals[i].value === value)
        {
            use = useInstr.inVals[i];
            break;
        }
    }

    assert (
        use !== undefined,
        'use not found'
    );

    arraySetRem(def.dests, useInstr);

    for (var i = 0; i < use.srcs.length; ++i)
    {
        if (use.srcs[i].value === value)
        {
            use.srcs.splice(i, 1);
            break;
        }
    }

    this.numEdges--;
}

/**
Get the type set for a value
*/
SPSTF.prototype.getType = function (instr, value)
{
    assert (
        instr instanceof SPSTFInstr,
        'invalid instruction object'
    );

    // If this is a constant
    if (value instanceof IRConst)
    {
        // Create a type set for the constant
        return TypeSet.constant(value);
    }

    // Try to find the use for this value in the list
    var use = undefined;
    for (var i = 0; i < instr.inVals.length; ++i)
    {
        if (instr.inVals[i].value === value)
        {
            use = instr.inVals[i];
            break;
        }
    }

    // If this is a new use, create the use object
    if (use === undefined)
    {
        var use = {
            value: value,
            srcs: []
        };

        instr.inVals.push(use);

        // Queue this instruction's block for live value analysis
        this.queueBlock(instr.block);
    }

    // Value type
    var type = TypeSet.empty;

    // For each source
    for (var i = 0; i < use.srcs.length; ++i)
    {
        var src = use.srcs[i];
        var targetIdx = src.targetIdx;
        var outIdx = src.outIdx;

        var outVal = src.instr.outVals[targetIdx][outIdx];

        type = type.union(outVal.type);
    }

    return type;
}

/**
Set the type set for a value
*/
SPSTF.prototype.setType = function (instr, value, type, targetIdx)
{
    if (targetIdx === undefined)
        targetIdx = 0;

    assert (
        instr instanceof SPSTFInstr,
        'invalid instruction object'
    );

    assert (
        value instanceof IRInstr ||
        value instanceof TGProperty ||
        value instanceof TGVariable
    );

    assert (
        targetIdx === 0 || targetIdx < instr.targets.length,
        'invalid target index'
    );

    // Get the list of definitions for this target
    var defList = instr.outVals[targetIdx];

    // Try to find the definition for this value in the list
    var def = undefined;
    for (var j = 0; j < defList.length; ++j)        
    {
        if (defList[j].value === value)
        {
            def = defList[j];
            break;
        }
    }

    // If the definition was found
    if (def !== undefined)
    {
        // If the type hasn't changed, do nothing
        if (def.type.equal(type) === true)
            return;

        // Update the definition type
        def.type = type;

        // Queue all the destination instructions
        for (i = 0; i < def.dests.length; ++i)
            this.queueInstr(def.dests[i]);
    }

    // This is a new definition for this instruction
    else
    {
        // Create a new definition object
        var def = {
            value: value,
            type: type,
            dests: []
        }

        // Add the new definition to the list for this target
        defList.push(def);

        // Queue this instruction's block for live value analysis
        this.queueBlock(instr.block);
    }
}

/**
Get the type for an instruction input (use) value
*/
SPSTF.prototype.getInType = function (instr, useIdx)
{
    assert (
        useIdx < instr.irInstr.uses.length,
        'invalid use index'
    );

    return this.getType(instr, instr.irInstr.uses[useIdx]);
}

/**
Set an instruction output type
*/
SPSTF.prototype.setOutType = function (instr, normalType, exceptType)
{
    if (exceptType === undefined)
        exceptType = normalType;

    this.setType(instr, instr.irInstr, normalType, 0);

    if (instr.targets.length > 1)
        this.setType(instr, instr.irInstr, exceptType, 1);
}

/**
Set (restrict) an instruction input type
*/
SPSTF.prototype.setInType = function (instr, useIdx, normalType, exceptType)
{
    assert (
        useIdx < instr.irInstr.uses.length,
        'invalid use index'
    );

    if (exceptType === undefined)
        exceptType = normalType;

    var value = instr.irInstr.uses[useIdx];

    this.setType(instr, value, normalType, 0);

    if (instr.targets.length > 1)
        this.setType(instr, value, exceptType, 1);
}

/**
Mark a branch instruction's target block as reachable
*/
SPSTF.prototype.touchTarget = function (instr, targetIdx)
{
    assert (
        targetIdx < instr.targets.length,
        'invalid target'
    );
    
    var target = instr.targets[targetIdx];

    // If this target has not yet been visited
    if (target instanceof SPSTFStump)
    {
        // Create the basic block for this target and queue it for analysis
        var block = this.getBlock(target, instr.block.func);

        instr.targets[targetIdx] = block;
    }
}

/**
Perform a property lookup with recursive prototype chain search
*/
SPSTF.prototype.propLookup = function (instr, objType, propName, depth)
{
    if (objType.flags === TypeFlags.ANY)
        throw '*WARNING: getProp on any type';

    // If there are non-object bases
    if (objType.flags & 
        ~(TypeFlags.EXTOBJ  | 
          TypeFlags.UNDEF   | 
          TypeFlags.NULL    |
          TypeFlags.STRING)
        )
        throw '*WARNING: getProp with invalid base';

    // If we have exceeded the maximum lookup depth
    if (depth > 8)
        throw '*WARNING: maximum prototype chain lookup depth exceeded';

    // Output type set
    var outType = TypeSet.empty;

    //print('depth ' + depth);
    //print('obj type : ' + objType);
    //print('prop name: ' + propName + ' ' + (typeof propName));

    // If the object may be a string
    if (objType.flags & TypeFlags.STRING)
    {
        // If this is the length property
        if (propName === 'length')
        {
            outType = outType.union(TypeSet.posInt);
        }

        // If this is a named property
        else if (typeof propName === 'string')
        {
            // Lookup the property on the string prototype
            var protoProp = this.propLookup(instr, this.strProto, propName, depth + 1);
            outType = outType.union(protoProp);
        }

        // Otherwise, this is an index property
        else
        {
            // This is a substring
            outType = outType.union(TypeSet.string);
        }
    }

    // For each possible object
    for (var objItr = objType.getObjItr(); objItr.valid(); objItr.next())
    {
        var obj = objItr.get();

        // If this is the length property of an array
        if (obj.flags === TypeFlags.ARRAY && propName === 'length')
        {
            outType = outType.union(TypeSet.posInt)
        }

        // Otherwise, for normal properties
        else
        {
            // Get the node for this property
            if (typeof propName === 'string')
                var propNode = obj.getPropNode(propName);
            else
                var propNode = obj.idxProp;

            // Get the type for this property node
            var propType = this.getType(instr, propNode)

            //print('prop type: ' + propType);
            //print('');

            // If this property may be missing or this is an unbounded array access
            if (propType.flags & TypeFlags.MISSING || propName === false)
            {
                // Get the type for the object's prototype
                var protoNode = obj.proto;
                var protoType = this.getType(instr, protoNode);

                // If the prototype is not necessarily null
                if (protoType.flags & ~TypeFlags.NULL)
                {
                    // Do a recursive lookup on the prototype
                    var protoProp = this.propLookup(instr, protoType, propName, depth + 1);

                    // If we know for sure this property is missing
                    if (propType.flags === TypeFlags.MISSING)
                    {
                        // Take the prototype property type as-is
                        propType = protoProp;
                    }
                    else
                    {
                        // Union the prototype property type
                        propType = propType.union(protoProp);
                    }
                }

                // If the prototype may be null, add the undefined type
                if (protoType.flags & TypeFlags.NULL)
                {
                    propType = propType.union(TypeSet.undef);
                }

                // Remove the missing flag from the property type
                propType = propType.restrict(propType.flags & (~TypeFlags.MISSING));
            }

            // Union the types for this property into the type set
            outType = outType.union(propType);
        }
    }

    //print('depth: ' + depth);
    //print('out type: ' + outType);
    //print('');

    return outType;
}

//=============================================================================
//
// Per-instruction flow/transfer functions
//
//=============================================================================

IRInstr.prototype.spstfFlowFunc = function (ta)
{
    // By default, do nothing
}

PhiInstr.prototype.spstfFlowFunc = function (ta)
{
    var outType = TypeSet.empty;

    // For each phi predecessor
    for (var i = 0; i < this.preds.length; ++i)
    {
        var pred = this.irInstr.preds[i];

        // TODO
        /*
        // If this predecessor hasn't been visited, skip it
        if (ta.blockGraphs.has(new BlockDesc(pred)) === false)
            continue;

        //print('merging pred ' + pred.getBlockName());

        // Merge the type of this incoming value
        var incType = typeGraph.getType(this.uses[i]);
        outType = outType.union(incType);
        */
    }

    ta.setOutType(this, outType);
}

GlobalObjInstr.prototype.spstfFlowFunc = function (ta)
{
    // This refers to the global object
    ta.setOutType(this, ta.globalObj);
}

InitGlobalInstr.prototype.spstfFlowFunc = function (ta)
{
    var propName = this.irInstr.uses[1].value;

    var globalObj = ta.globalObj.getObjItr().get();

    var propNode = globalObj.getPropNode(propName);

    ta.setType(this, propNode, TypeSet.undef);
}

BlankObjInstr.prototype.spstfFlowFunc = function (ta)
{
    // Create a new object from the object prototype
    var newObj = ta.newObject(this, this.irInstr, ta.objProto);

    // The result is the new object
    ta.setOutType(this, newObj);
}

BlankArrayInstr.prototype.spstfFlowFunc = function (ta)
{
    // Create a new array object from the array prototype
    var newObj = ta.newObject(this, this.irInstr, ta.arrProto, TypeFlags.ARRAY);

    // The result is the new object
    ta.setOutType(this, newObj);
}

HasPropInstr.prototype.spstfFlowFunc = function (ta)
{
    ta.setOutput(typeGraph, this, TypeSet.bool);

    ta.setOutType(this, TypeSet.boolj);
}

PutPropInstr.prototype.spstfFlowFunc = function (ta)
{
    var objType  = ta.getInType(this, 0);
    var nameType = ta.getInType(this, 1);
    var valType  = ta.getInType(this, 2);

    /*
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
    */
}

/*
GetPropInstr.prototype.spstfFlowFunc = function (ta)
{
    // Test if this is a bounded arguments object propery access
    function boundedArgsGet(instr)
    {
        function isArgObj(valDef)
        {
            return (
                valDef instanceof CallFuncInstr && 
                valDef.uses[0] instanceof IRFunction &&
                valDef.uses[0].funcName === 'makeArgObj'
            );
        }        

        function allDestsGet(valDef)
        {
            for (var i = 0; i < valDef.dests.length; ++i)
                if ((valDef.dests[i] instanceof GetPropInstr) === false)
                    return false;

            return true;
        }

        function idxBounded(valDef, idx, curBlock, depth)
        {
            if (depth >= 5)
                return false;

            if (curBlock.preds.length === 0)
                return false;

            // For each predecessor
            for (var i = 0; i < curBlock.preds.length; ++i)
            {
                var pred = curBlock.preds[i];

                var branch = pred.getLastInstr();

                if (branch instanceof IfInstr && 
                    branch.uses[1] === IRConst.getConst(true) &&
                    branch.uses[0] instanceof JSLtInstr &&
                    branch.uses[0].uses[0] === idx &&
                    branch.uses[0].uses[1] instanceof GetPropInstr &&
                    branch.uses[0].uses[1].uses[0] === valDef &&
                    branch.uses[0].uses[1].uses[1] === IRConst.getConst('length') &&
                    branch.targets[0] === curBlock)
                {
                    continue;
                }
                
                if (idxBounded(valDef, idx, pred, depth + 1) === false)
                    return false;
            }

            return true;
        }

        var valDef = instr.uses[0];
        var idx = instr.uses[1];
        var curBlock = instr.parentBlock;

        if (isArgObj(valDef) === true &&
            allDestsGet(valDef) === true && 
            idxBounded(valDef, idx, curBlock, 0) === true)
            return true;

        return false;
    }

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
            // TODO: more generic test for pos int, int < arr.length

            // If this is a bounded arguments access
            if (boundedArgsGet(this) === true)
            {
                // The array access is bounded
                propName = true;
            }
            else
            {
                // For now, assume unbounded array access
                propName = false;
            }
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
}
*/

//GetGlobalInstr.prototype.typeProp = GetPropInstr.prototype.typeProp;

JSAddInstr.prototype.spstfFlowFunc = function (ta)
{
    var t0 = ta.getInType(this, 0);
    var t1 = ta.getInType(this, 1);
    
    // Output type
    var outType;

    /*
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
    */
}

/*
JSSubInstr.prototype.spstfFlowFunc = function (ta)
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

/*
JSMulInstr.prototype.spstfFlowFunc = function (ta)
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
        if (isNaN(minVal))
            minVal = -Infinity;

        var maxVal;
        maxVal = t0.rangeMax * t1.rangeMax;
        maxVal = Math.max(maxVal, t0.rangeMin * t1.rangeMin);
        if (isNaN(maxVal))
            maxVal = Infinity;

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

/*
JSDivInstr.prototype.spstfFlowFunc = function (ta)
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

// Bitwise operations
JSBitOpInstr.prototype.spstfFlowFunc = function (ta)
{
    ta.setOutType(this, TypeSet.integer);
}

// Comparison operator base class
JSCompInstr.prototype.spstfFlowFunc = function (ta)
{
    var v0 = ta.getInType(this, 0);
    var v1 = ta.getInType(this, 1);

    ta.setOutType(this, TypeSet.bool);
}

/*
// Operator ==
JSEqInstr.prototype.spstfFlowFunc = function (ta)
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

/*
// Operator ===
JSSeInstr.prototype.spstfFlowFunc = function (ta)
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

/*
// Operator !=
JSNeInstr.prototype.spstfFlowFunc = function (ta)
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

/*
// Operator !==
JSNsInstr.prototype.spstfFlowFunc = function (ta)
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

JumpInstr.prototype.spstfFlowFunc = function (ta)
{
    // Make the successor reachable
    ta.touchTarget(this, 0);
}

// TODO
// TODO: throw, must merge with all possible catch points
// TODO

/*
// If branching instruction
IfInstr.prototype.spstfFlowFunc = function (ta)
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
            var falseLType = lType;
            
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

JSCallInstr.prototype.spstfFlowFunc = function (ta)
{
    // Get the type set for the callee
    var calleeType = ta.getInType(this, 0);

    // If the callee is unknown or non-function
    if (calleeType.flags === TypeFlags.ANY || 
        (calleeType.flags & TypeFlags.FUNCTION) === 0)
    {
        if (config.verbosity >= log.DEBUG)
            print('*WARNING: callee has type ' + calleeType);

        ta.setOutType(this, TypeSet.any);

        // Don't stop the inference for this block
        return false;
    }

    // Test if this is a new/constructor call
    var isNew = this instanceof JSNewInstr;

    // If this is a regular function call
    if (isNew === false)
    {
        // Get the this argument call
        var thisType = ta.getInType(this, 1);
    }
    else
    {
        // Lookup the "prototype" property of the callee
        var protoType = ta.propLookup(this, calleeType, 'prototype', 0);

        // If the prototype may not be an object
        if (protoType.flags & (~TypeFlags.EXTOBJ))
        {
            // Exclude non-objects and include the object prototype object
            protoType = protoType.restrict(protoType.flags & (~TypeFlags.EXTOBJ));
            protoType = protoType.union(ta.objProto);
        }

        // Create a new object to use as the this argument
        var thisType = ta.newObject(this, this.irInstr, protoType);
    }

    // Union of the return type of all potential callees
    var retType = TypeSet.empty;

    // For each potential callee
    for (var itr = calleeType.getObjItr(); itr.valid(); itr.next())
    {
        var callee = itr.get();

        // Get the origin for this class
        var origin = callee.origin;

        // If this is not a function, ignore it
        if ((origin instanceof IRFunction) === false)
            continue;

        print('callee: ' + origin.funcName);

        // Get the SPSTFFunc instance for this value
        var func = ta.getFunc(origin);

        // Add the function to the callee set
        arraySetAdd(this.callees, func);

        // Add this instruction to the set of callers of the function
        arraySetAdd(func.callSites, this);

        // Set the call type flags
        if (isNew === true)
            func.ctorCall = true;
        else
            func.normalCall = true;

        // For each argument
        for (var j = 0; j < func.argVals.length; ++j)
        {
            var argVals = func.argVals[j];

            var argVal; 

            // Get the incoming type for this argument
            if (j === 0)
            {
                argVal = this.irInstr.uses[0];
            }
            else if (j === 1)
            {
                argVal = this.irInstr.uses[1];
            }
            else
            {
                var useIdx = (isNew === true)? (j-1):j;
                argVal =
                    (useIdx < this.uses.length)?
                    this.uses[useIdx]:
                    IRConst.getConst(undefined);

                // TODO: re-queue arg obj instr on change

                // If this function uses the arguments object, add the
                // value to the indexed argument value list
                if (func.irFunc.usesArguments === true)
                    arraySetAdd(func.idxArgVals, argVal);
            }

            // If this is a new value for this argument
            if (arraySetHas(argVals, argVal) === false)
            {
                // Add the value to the set of values for this argument
                arraySetAdd(argVals, argVal);

                // Queue the argument value instruction
                var argInstr = func.argInstrs[j];
                if (argInstr !== undefined)
                    ta.queueInstr(func.argInstrs[j]);
            }
        }

        // Compute the return type for this call
        var calleeRet = TypeSet.empty;
        for (var i = 0; i < func.retVals.length; ++i)
        {
            var retRet = ta.getType(instr, func.retVals[i]);
            calleeRet = calleeRet.union(retRet);
        }

        // If this is a constructor call
        if (isNew === true)
        {
            var newCalleeRet = TypeSet.empty;

            // If the return type may be undefined
            if (calleeRet.flags & TypeFlags.UNDEF)
            {
                // Union the "this" argument type
                newCalleeRet = newCalleeRet.union(thisType);
            }

            // If the return type may be not undefined
            if (calleeRet.flags !== TypeFlags.UNDEF)
            {
                // Union all but undefined
                newCalleeRet = newCalleeRet.union(calleeRet.restrict(
                    calleeRet.flags & ~TypeFlags.UNDEF
                ));
            }

            calleeRet = newCalleeRet;
        }

        // Update the return type
        retType = retType.union(calleeRet);
    }

    // Restrict the callee type in the continuation to functions
    var newCalleeType = calleeType.restrict(TypeFlags.FUNCTION);        
    ta.setInType(this, 0, newCalleeType, calleeType);

    // Set the call return type
    ta.setOutType(this, retType);

    // Mark the successors as reachable
    for (var i = 0; i < this.targets.length; ++i)
        ta.touchTarget(this, i);
}

// New/constructor call instruction
// Handled by the same function as the regular call instruction
//JSNewInstr.prototype.typeProp = JSCallInstr.prototype.typeProp;

// Call with apply instruction
// TODO
//CallApplyInstr.prototype.spstfFlowFunc = function (ta)
//{
//}

ArgValInstr.prototype.spstfFlowFunc = function (ta)
{
    print('ArgValInstr');

    var func = this.block.func;
    var argIndex = this.irInstr.argIndex;
    var argVals = func.argVals[argIndex];

    var argType = TypeSet.empty;

    for (var i = 0; i < argVals; ++i)
    {
        var val = argVals[i];
        var type = ta.getType(this, val);

        argType = argType.union(type);
    }

    ta.setOutType(this, argType);
}

RetInstr.prototype.spstfFlowFunc = function (ta)
{
    print('RetInstr');

    var func = this.block.func;
    var retVals = func.retVals;

    // Get the return value
    var retVal = this.irInstr.uses[0];

    // If this return value is not yet accounted for
    if (this.visited !== true && arraySetHas(retVals, retVal) === false)
    {
        arraySetAdd(retVals, retVal);
        this.visited = true;

        // Queue the call instructions at the call sites
        for (var i = 0; i < func.callSites.length; ++i)
            ta.queueInstr(func.callSites[i]);
    }
}

// LIR call instruction
CallFuncInstr.prototype.spstfFlowFunc = function (ta)
{
    var callee = this.irInstr.uses[0];

    // Return type (by default, any type)
    var retType = TypeSet.any;

    // If we cannot determine the callee
    if ((callee instanceof IRFunction) === false)
    {
        // Do nothing
    }

    /*
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
    */

    // Closure object creation
    else if (callee.funcName === 'makeClos')
    {
        print('makeClos');

        var func = this.irInstr.uses[3];
        var numClosCells = this.irInstr.uses[4].value;

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
        var funcObj = ta.newObject(
            this,
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
            var globalFunc = (
                this.irInstr.parentBlock &&
                this.irInstr.parentBlock.parentCFG.ownerFunc.parentFunc === null
            );

            // Create a Function.prototype object for the function
            var protoObj = ta.newObject(
                this,
                this.irInstr, 
                ta.objProto,
                undefined,
                undefined,
                globalFunc
            );
        }

        // Assign the prototype object to the Function.prototype property
        var protoNode = funcObj.getObjItr().get().getPropNode('prototype');
        ta.setType(this, protoNode, protoObj);

        retType = funcObj;
    }

    /*
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
    */

    // Unknown primitive
    else
    {
        print('unknown primitive: ' + callee.funcName);
    }

    // Set our own output type
    ta.setOutType(this, retType);

    /*
    // Merge with all possible branch targets
    for (var i = 0; i < this.targets.length; ++i)
        ta.succMerge(this.targets[i], typeGraph);
    */
}


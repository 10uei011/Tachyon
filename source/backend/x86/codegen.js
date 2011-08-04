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
Register allocation and x86 code generation.

@author
Maxime Chevalier-Boisvert
*/

/**
x86 namespace
*/
var x86 = x86 || {};

/**
Generate the assembly code for one function
*/
x86.genCode = function (irFunc, blockOrder, liveness, backend, params)
{
    // Assembler object to create instructions into
    var asm = new x86.Assembler(backend.x86_64);

    // Export a label for the function's default entry point
    asm.addInstr(new x86.Label('ENTRY_DEFAULT', true));

    // Map of block ids to allocation map at block entries
    // This is used to store allocations at blocks with
    // multiple predecessors
    var allocMaps = [];

    // Get a reference to the entry block
    var entryBlock = irFunc.virginCFG.entry;

    // Create the register allocation map for the entry block
    // Maps temporaries and constants to register and stack locations
    // Note that constants will not be spilled on the stack
    var entryMap = new x86.RegAllocMap(backend.regSizeBytes, backend.spReg);

    // Map the entry block to its allocation map
    allocMaps[entryBlock.blockId] = entryMap;

    // Get the calling convention for this function
    var callConv = params.backend.getCallConv(irFunc.cProxy? 'c':'tachyon');

    // Get the number of function arguments
    var numArgs = irFunc.argVars.length + (irFunc.cProxy? 0:2);

    // Map the arguments on the stack
    if (callConv.argsOrder === 'LTR')
    {
        // For each function argument, in left-to-right order
        for (var i = callConv.argRegs.length; i < numArgs; ++i)
            entryMap.allocArg(i);
    }
    else
    {
        // For each function argument, in left-to-right order
        for (var i = numArgs - 1; i >= callConv.argRegs.length; --i)
            entryMap.allocArg(i);
    }

    // Map the return address on the stack
    entryMap.allocRetAddr();

    // Save the callee-save registers (if any) on the stack
    for (var i = 0; i < callConv.calleeSave.length; ++i)
    {
        var reg = callConv.calleeSave[i];

        // Spill the register on the stack
        var slotIdx = entryMap.spillValue(reg, undefined, asm);
        var memLoc = entryMap.getSlotOpnd(slotIdx);
        asm.mov(memLoc, reg);
    }

    //
    // TODO
    // Callee pops stack frame & args... Ideally want stack frame
    // normalization stub.
    //

    // List of block labels
    var blockLabels = [];

    // Map of CFG edges to edge transition labels
    var edgeLabels = new CfgEdgeMap();

    // For each predecessor block in the merge move map
    for (var i = 0; i < blockOrder.length; ++i)
    {
        var pred = blockOrder[i];

        // Create a label for this block
        blockLabels[pred.blockId] = new x86.Label(pred.getBlockName());

        // For each successor
        for (var j = 0; j < pred.succs.length; ++j)
        {
            var succ = pred.succs[j];

            var edge = {pred:pred, succ:succ};

            var edgeLabel = new x86.Label(
                pred.getBlockName() + '_' + 
                succ.getBlockName()
            );

            // Create a label for this CFG edge transition
            edgeLabels.addItem(
                edge,
                edgeLabel
            );
        }
    }

    // Code generation info object
    var genInfo = {
        callConv: callConv,
        edgeLabels: edgeLabels,
        allocMap: entryMap,
        backend: backend,
        params: params
    };

    // For each block in the ordering
    for (var i = 0; i < blockOrder.length; ++i)
    {
        var block = blockOrder[i];

        log.debug('processing block: ' + block.getBlockName());

        // Get a copy of the allocation map at the start of this block
        var allocMap = allocMaps[block.blockId].copy();

        assert (
            allocMap instanceof x86.RegAllocMap,
            'invalid reg alloc map for: ' + block.getBlockName()
        );

        // Store the current alloc map on the code gen info object
        genInfo.allocMap = allocMap;

        // For each predecessor of this block
        for (var j = 0; j < block.preds.length; ++j)
        {
            var pred = block.preds[j];

            // If this predecessor has only one successor, skip it
            if (pred.succs.length === 1)
                continue;

            /*
            // Insert the edge transition stub
            x86.genEdgeTrans(
                asm,
                pred, 
                block,
                blockLabels,
                edgeLabels,
                params
            );
            */
        }

        // Add the label for this block
        asm.addInstr(blockLabels[block.blockId]);

        // For each instruction in the block
        for (var j = 0; j < block.instrs.length; ++j)
        {
            var instr = block.instrs[j];

            log.debug('processing: ' + instr);

            // Get the live set at the output of this instruction
            var instrLiveIn = liveness.instrIn[instr.instrId];

            assert (
                instr instanceof PhiInstr || instrLiveIn instanceof HashMap,
                'invalid live map for: ' + instr.getValName()
            );

            // If this is a phi node
            if (instr instanceof PhiInstr)
            {
                // Do nothing, phi nodes already mapped
            }

            // If this is an argument value instruction
            else if (instr instanceof ArgValInstr)
            {
                // Get the argument index
                var argIndex = instr.argIndex;

                // If the argument is in a register
                if (argIndex < callConv.argRegs.length)
                {
                    // Allocate the register to the argument
                    allocReg(
                        allocMap,
                        undefined,
                        liveOut, 
                        instr, 
                        callConv.argRegs[argIndex],
                        []
                    );
                }
                else
                {
                    // Map the argument to its stack location
                    var stackSlot = stackMap.getArgSlot(argIndex);
                    allocMap.makeAlloc(instr, stackSlot);
                }
            }

            // If this is the argument number instruction
            else if (instr instanceof GetNumArgsInstr)
            {
                assert (
                    callConv.argCountReg instanceof x86.Register,
                    'num args instr but call conv does not have arg count reg'
                );

                // Allocate the register to the argument count
                allocReg(
                    allocMap,
                    undefined,
                    liveOut,
                    instr, 
                    callConv.argCountReg,
                    undefined
                );
            }

            // If this is the argument table instruction
            else if (instr instanceof GetArgTableInstr)
            {
                assert (
                    irFunc.usesArguments === true,
                    'arg table instr but function does not use arguments'
                );

                // TODO: get spill slot, note its stack loc?
                error('arg table instr not yet supported');
            }

            // For all other kinds of instructions
            else
            {
                assert (
                    instr.x86 !== undefined &&
                    'missing instr cfg for "' + instr.mnemonic + '"'
                );

                // Perform register allocation for instruction
                var allocInfo = x86.allocOpnds(
                    allocMap,
                    instr,
                    asm,
                    params
                );

                assert (
                    instr.x86.genCode !== undefined,
                    'no genCode method for "' + instr.mnemonic + '"'
                );

                // Generate code for the instruction
                instr.x86.genCode(
                    instr, 
                    allocInfo.opnds, 
                    allocInfo.dest, 
                    allocInfo.scratch,
                    asm,
                    genInfo
                );
            }
        }

        // If this is a block with a single successor, insert the 
        // transition stub directly after it
        if (block.succs.length === 1)
        {
            /*
            // Insert the edge transition stub
            x86.genEdgeTrans(
                asm,
                pred, 
                block,
                blockLabels,
                edgeLabels,
                params
            );
            */
        }
    }

    if (config.verbosity >= log.DEBUG)
    {
        log.debug('');
        log.debug('assembly:')
        log.debug(asm.toString(true));
        log.debug('');
    }

    // Return the assembler object
    return asm;
}

/*
Generate code for CFG block edge transitions
*/
x86.genEdgeTrans = function ()
{
    // TODO
    // TODO
    // TODO
}

/**
Allocate a register to a value
@param allocMap allocation map
@param value value to be allocated, may be undefined
@fixedReg fixed register we must allocate to, undefined
@param liveSet set of live temporaries
@excludeMap map of registers to exclude from allocation
*/
x86.allocReg = function (
    allocMap, 
    value, 
    fixedReg, 
    liveSet,
    excludeMap,
    asm,
    params
)
{
    const backend = params.backend;
    const gpRegSet = backend.gpRegSet;

    // Best register found so far
    var bestReg = undefined;
    var bestRegWeight = MAX_FIXNUM;

    // If we must allocate to a fixed register
    if (fixedReg !== undefined)
    {
        // Allocate to the fixed register
        bestReg = fixedReg;
    }
    else
    {
        // Set of registers to allocate from
        var regSet = gpRegSet;

        // For each register in the register set
        for (var i = 0; i < regSet.length; ++i)
        {
            var reg = regSet[i];

            // Get the sub-register corresponding to the value size
            var subReg;
            if (value !== undefined)
                subReg = reg.getSubOpnd(value.type.getSizeBits(params));
            else
                subReg = reg;
            
            // If a REX prefix is needed and we aren't in 64-bit, skip it
            if (subReg.rexNeeded === true && backend.x86_64 !== true)
                continue;

            // If this register is in the excluded set, skip it
            if (excludeMap[reg.regNo] === true)
                continue;

            // Get the value the register currently maps to
            var regVal = allocMap.getRegVal(reg);

            // Weight for the value currently mapped to the register
            var weight = 0;

            // If the register is mapped to a live value
            if (regVal !== undefined && liveSet.hasItem(regVal) === true)
            {
                weight += 1;

                if (regVal instanceof IRInstr)
                    weight += regVal.uses.length;
            }

            // Update the best register choice
            if (weight < bestRegWeight)
            {
                bestReg = reg;
                bestRegWeight = weight;
            }
        }
    }

    assert (
        bestReg !== undefined,
        'could not allocate register'
    );

    // Free the register, if needed
    freeReg(allocMap, bestReg, liveSet, asm, params);

    // Update the allocation map
    if (value !== undefined)
        allocMap.makeAlloc(value, bestReg);

    // Return the allocated register
    return bestReg;
}

/**
Free a register if needed. This may cause a spill
*/
x86.freeReg = function (
    allocMap, 
    reg, 
    liveSet, 
    asm,
    params
)
{
    // Get the current value for this register
    var curVal = allocMap.getRegVal(reg);

    // If the register isn't mapped to a value, do nothing
    if (curVal === undefined)
        return;

    // Remove the allocation of the register to the value
    allocMap.remAlloc(curVal, reg);

    // If the register is not mapped to a live value, do nothing
    if (liveSet.hasItem(curVal) === false)
        return;

    // if the value is a constant, do nothing
    if ((curVal instanceof IRInstr) === false)
        return;

    // Get the current allocations for the value
    var allocs = allocMap.getAllocs(curVal);

    // If there is already another allocation for the value, do nothing
    if (allocs.length > 0)
        return;

    // Map the value to a stack spill slot
    var stackSlot = allocMap.spillValue(curVal, liveSet, asm);

    // Get the operand for the spill slot
    var stackOpnd = allocMap.getSlotOpnd(stackSlot);

    // Move the value to the spill slot
    asm.mov(stackOpnd, reg);
}

/**
Get the best current allocation for a value
*/
x86.getBestAlloc = function (allocMap, value)
{
    var allocs = allocMap.getAllocs(value);

    var bestAlloc = undefined;

    for (var i = 0; i < allocs.length; ++i)
    {
        var alloc = allocs[i];

        if (alloc instanceof x86.Register)
            bestAlloc = alloc;

        else if (bestAlloc === undefined)
            bestAlloc = alloc;
    }

    return bestAlloc;
}

/**
Allocate operands for generic (non-meta) instructions
*/
x86.allocOpnds = function (
    allocMap,
    instr,
    asm,
    params
)
{
    // Get the instruction configuration
    var instrCfg = instr.x86;

    // Set of registers not to be spilled
    var excludeMap = new Array(16);

    // For each use of the instruction
    for (var k = 0; k < instr.uses.length; ++k)
    {
        var use = instr.uses[k];

        // Get the set of registers this operand can be in
        var opndReg = instrCfg.opndMustBeReg(instr, k, params);

        // If this operand must be in a fixed register, reserve it
        if (opndReg instanceof x86.Register)
        {
            excludeMap[opndReg.regNo] = true;
            continue;
        }

        // Get the current allocations for the operand
        var allocs = allocMap.getAllocs(use);

        // For each allocation
        for (var l = 0; l < allocs.length; ++l)
        {
            var alloc = allocs[l];

            // If this is not a register, skip it
            if ((alloc instanceof x86.Register) === false)
                continue;

            // Add the register to the exclude set
            excludeMap[alloc.regNo] = true;
            break;
        }
    }

    // Get the allocation parameters for the destination
    var destIsOpnd0 = instrCfg.destIsOpnd0(instr, params);
    var destMustBeReg = instrCfg.destMustBeReg(instr, params);

    // If the destination is in a fixed register, exclude it
    // from allocation
    if (destMustBeReg instanceof x86.Register)
        excludeMap[destMustBeReg.regNo] = true;

    // Get the set of registers this instruction will write to
    var writeRegs = instrCfg.writeRegSet(instr, params);

    // If this instruction writes to registers
    if (writeRegs !== undefined)
    {
        assert (
            writeRegs instanceof Array,
            'write reg set is not an array'
        );

        // Add the write registers to the exclude set
        for (var k = 0; k < writeRegs.length; ++k)
            excludeMap[writeRegs[k].regNo] = true;
    }

    // List of moves to precede the instruction
    var preMoves = [];

    // Get the max number of memory operands for the instruction
    var maxMemOpnds = instrCfg.maxMemOpnds(instr, params);

    // Get the max number of immediate operands for the instruction
    var maxImmOpnds = instrCfg.maxImmOpnds(instr, params);

    // Number of register allocated operands
    var numRegOpnds = 0;

    // Number of memory allocated operands
    var numMemOpnds = 0;

    // Number of immediate operands used
    var numImmOpnds = 0;

    // List of operands
    var opnds = [];

    // For each use of the instruction
    for (var opndIdx = 0; opndIdx < instr.uses.length; ++opndIdx)
    {
        var use = instr.uses[opndIdx];

        // Get the register allocation parameters for this operand
        var opndMustBeReg = instrCfg.opndMustBeReg(instr, opndIdx, params);

        // If the operand is a link-time value, it must be in a register
        if (x86.isLinkValue(use) === true && opndMustBeReg === false)
            opndMustBeReg = true;

        // Test if this operand can be in memory
        if (opndMustBeReg === false && numMemOpnds >= maxMemOpnds)
            opndMustBeReg = true;

        // Test if this operand can be an immediate
        var immSize = x86.getImmSize(use, params);
        var opndCanBeImm = (immSize !== undefined);
        if (opndCanBeImm === true)
        {
            opndCanBeImm = instrCfg.opndCanBeImm(
                instr, 
                opndIdx, 
                immSize, 
                params
            );
        }

        // Operand assigned to this value
        var opnd = undefined;

        assert (
            !(use instanceof IRInstr && 
              allocMap.getAllocs(use).length === 0),
            'no allocation for live temporary: ' + use
        );

        // Get the best current allocation for the value
        var bestAlloc = getBestAlloc(allocMap, use);

        // If this value is already in a register
        if (bestAlloc instanceof x86.Register && 
            numRegOpnds < MAX_REG_OPNDS)
        {
            // If this is a valid register for this operand
            if (!(opndMustBeReg instanceof x86.Register && 
                  opndMustBeReg !== bestAlloc))
            {
                // Use the register operand
                opnd = bestAlloc;
            }
        }

        // FIXME: make this more optimal
        // If this value can be in memory and is already stack allocated
        else if (typeof bestAlloc === 'number' && opndMustBeReg === false)
        {
            // Use the stack operand
            opnd = bestAlloc;
        }

        // If this operand can be an immediate and immediate 
        // operands are still available
        else if (opndCanBeImm === true &&
                 numImmOpnds < maxImmOpnds &&
                 (destIsOpnd0 === false || opndIdx !== 0))
        {
            // Use the immediate value for this operand
            opnd = new x86.Immediate(use.getImmValue(params));
        }

        // If the dest is this operand and the use is 
        // still live after this instruction
        var destNeedsReg = destIsOpnd0 && opndIdx === 0 && liveOut.hasItem(use);

        // Value for which this operand is being allocated
        var mapVal = (destIsOpnd0 && opndIdx === 0)? instr:use;

        //log.debug('dest needs reg: ' + destNeedsReg);

        // If no operand was assigned or the dest needs
        // its own register
        if (opnd === undefined || destNeedsReg === true)
        {
            // If registers are still available
            if (numRegOpnds < MAX_REG_OPNDS)
            {
                // Allocate a register for the operand
                opnd = allocReg(
                    allocMap,
                    preMoves,
                    liveOut,
                    mapVal,
                    (opndMustBeReg instanceof x86.Register)?
                    opndMustBeReg:undefined,
                    excludeMap
                );
            }
            else
            {
                // Map the operand to a stack location
                opnd = allocMap.spillValue(mapVal, liveSet, asm);
            }

            // Move the value into the operand
            addMove(
                preMoves,
                (bestAlloc !== undefined)? bestAlloc:use,
                opnd
            );
        }

        // If the operand is a register
        if (opnd instanceof x86.Register)
        {
            // Map the value to the register
            allocMap.makeAlloc(mapVal, opnd);

            // Add the register to the exclude set
            excludeMap[opnd.regNo] = true;

            // Get the sub-register appropriate to the value's type
            var opnd = opnd.getSubOpnd(mapVal.type.getSizeBits(params));

            ++numRegOpnds;
        }

        // If the operand is a stack location
        else if (typeof opnd === 'number')
        {
            // Map the value to the stack location
            allocMap.makeAlloc(mapVal, opnd);

            ++numMemOpnds;
        }

        // If the operand is an immediate
        else if (opnd instanceof x86.Immediate)
        {
            ++numImmOpnds;
        }

        // If the operand is not valid
        else
        {
            error('invalid opnd: ' + opnd);
        }

        // Add the operand to the list
        opnds.push(opnd);
    }

    // Get the number of scratch registers for this instruction
    var numScratchRegs = instrCfg.numScratchRegs(instr, params); 

    // List of scratch registers
    var scratchRegs = [];

    // For each scratch register to allocate
    for (var k = 0; k < numScratchRegs; ++k)
    {
        log.debug('allocating scratch');

        // Allocate the scratch register
        var reg = allocReg(
            allocMap,
            preMoves,
            liveOut,
            undefined,
            undefined,
            excludeMap
        );
        scratchRegs.push(reg);

        // Add the register to the exclude set
        excludeMap[reg.regNo] = true;
    }

    // If this instruction writes to registers
    if (writeRegs !== undefined)
    {
        assert (
            writeRegs instanceof Array,
            'write reg set is not an array'
        );

        // For each register this instruction writes to
        for (var k = 0; k < writeRegs.length; ++k)
        {
            var reg = writeRegs[k];

            log.debug('freeing write reg');

            // Free the register
            freeReg(
                allocMap,
                preMoves,
                liveOut,
                reg
            );
        }
    }

    assert (
        !(destIsOpnd0 && opnds.length === 0),
        'dest mapped to opnd0 but instr has no operands:\n' +
        instr
    );

    // Destination operand
    var dest;

    // If this instruction has no output
    if (instr.type === IRType.none)
    {
        dest = undefined;
    }

    // If the dest is not opnd 0
    else if (destIsOpnd0 === false)
    {
        // Allocate a register for the destination
        dest = allocReg(
            allocMap,
            preMoves,
            liveOut,
            instr,
            (destMustBeReg instanceof x86.Register)?
            destMustBeReg:undefined,
            excludeMap
        );
    }

    // If the dest is opnd 0
    else
    {
        dest = opnds[0];
    }

    // Get the sub-operand of the appropriate size
    dest = dest.getSubOpnd(instr.type.getSizeBits(params));

    // Return the allocation information
    return {
        opnds: opnds,
        dest: dest,
        scratch: scratchRegs
    };
}

/**
@class Per-instruction register allocation hints/constraints
*/
x86.InstrCfg = function ()
{
}

/**
Maximum number of memory operands to use
*/
x86.InstrCfg.prototype.maxMemOpnds = function (instr, params)
{
    return 1;
}

/**
Maximum number of immediate operands to use
*/
x86.InstrCfg.prototype.maxImmOpnds = function (instr, params)
{
    return 1;
}

/**
Number of scratch registers wanted
*/
x86.InstrCfg.prototype.numScratchRegs = function (instr, params)
{
    return 0;
}

/**
Registers this instruction will have to write to, excluding
scratch registers, operands and the destination.
*/
x86.InstrCfg.prototype.writeRegSet = function (instr, params)
{
    return undefined;
}

/**
Indicates that an operand can be an immediate
*/
x86.InstrCfg.prototype.opndCanBeImm = function (instr, opIdx, immSize, params)
{
    return false;
}

/**
Indicates that an operand must be placed in a register. A specific
register may be returned, otherwise, the value true specifies any
register.
*/
x86.InstrCfg.prototype.opndMustBeReg = function (instr, opIdx, params)
{
    return false;
}

/**
Dest is operand 0.
*/
x86.InstrCfg.prototype.destIsOpnd0 = function (instr, params)
{
    if (instr.uses.length === 0 || instr.type === IRType.none)
        return false;

    return true;
}

/**
Indicates that the destination must be placed in a register. A
specific register may be returned, otherwise, the value true specifies
any register.
*/
x86.InstrCfg.prototype.destMustBeReg = function (instr, params)
{
    return false;
}

/**
@class Register allocation map. Maps temporaries and constants to
registers and stack locations at a given point within a function.
*/
x86.RegAllocMap = function (slotSize, spReg)
{
    assert (
        slotSize === 4 || slotSize === 8,
        'invalid slot size'
    );

    assert (
        spReg instanceof x86.Register && spReg.type === 'gp',
        'invalid stack pointer'
    );

    /**
    @field Stack frame slot size, in bytes
    */
    this.slotSize = slotSize;

    /**
    @field Stack pointer register to be used
    */
    this.spReg = spReg;

    /**
    @field Map of arguments to slot indices
    */
    this.argMap = [];

    /**
    @field Number of argument slots
    */
    this.numArgSlots = 0;

    /**
    @field Slot index of the return address
    */
    this.retAddrSlot = undefined;

    /**
    @field Number of spill slots currently used. The current size
    of the stack frame depends on this value.
    */
    this.numSpillSlots = 0;

    /**
    @field Map of register numbers to IR values
    */
    this.regMap = [];

    /**
    @field Map of stack slots to values
    */
    this.stackMap = new HashMap();

    /**
    @field Map of values to list of current allocations
    */
    this.allocMap = new HashMap();
}

/**
Copy an allocation map
*/
x86.RegAllocMap.prototype.copy = function ()
{
    // Create a new reg alloc map
    var newMap = new x86.RegAllocMap(this.slotSize, this.spReg);

    // Copy the map of arguments to slot indices
    newMap.argMap = this.argMap.slice(0);

    // Copy the number of argument slots
    newMap.numArgSlots = this.numArgSlots;

    // Copy the slot index of the return address
    newMap.retAddrSlot = this.retAddrSlot;

    // Copy the number of spill slots
    newMap.numSpillSlots = this.numSpillSlots;

    // Copy the GP register map
    newMap.regMap.length = this.regMap.length;
    for (var i = 0; i < this.regMap.length; ++i)
        newMap.regMap[i] = this.regMap[i];

    // Copy the stack slot map
    newMap.stackMap = this.stackMap.copy();

    // Copy the number of spills
    newMap.numSpills = this.numSpills;

    // Copy the alloc map
    for (var itr = this.allocMap.getItr(); itr.valid(); itr.next())
    {
        var item = itr.get();
        var val = item.key;
        var list = item.value;

        var newList = new Array(list.length);
        for (var i = 0; i < list.length; ++i)
            newList[i] = list[i];

        newMap.allocMap.setItem(val, newList);
    }

    // Return the copy
    return newMap;
}

/**
Produce a string representation of an allocation map
*/
x86.RegAllocMap.prototype.toString = function ()
{
    var str = '';

    str += 'GP registers:';

    for (var regNo = 0; regNo < this.regMap.length; ++regNo)
    {        
        var value = this.regMap[regNo];

        if (value === undefined)
            continue;

        str += '\nreg' + regNo + ' => ' + value.getValName();
    }

    return str;
}

/**
Allocate a stack location for the return address
*/
x86.RegAllocMap.prototype.allocArg = function (argIdx)
{
    assert (
        isNonNegInt(argIdx) && this.argMap[argIdx] === undefined,
        'invalid argument index: ' + argIdx
    );

    var slotIdx = this.numArgSlots;

    this.argMap[argIdx] = slotIdx;

    this.numArgSlots += 1;
}

/**
Allocate a stack location for the return address
*/
x86.RegAllocMap.prototype.allocRetAddr = function ()
{
    assert (
        this.retAddrSlot === undefined,
        'return address mapped on stack'
    );

    var slotIdx = this.numArgSlots;

    this.retAddrSlot = slotIdx;
}

/**
Allocate a new spill slot on the stack
*/
x86.RegAllocMap.prototype.allocSpill = function (asm)
{
    // Compute the slot index for the new slot
    var slotIdx = (this.numArgSlots + 1) + this.numSpillSlots;

    // Increment the number of spill slots
    this.numSpillSlots++;

    // Decrement the stack pointer
    asm.sub(this.spReg, this.slotSize);
    
    return slotIdx;
}

/**
Get the stack slot for a given argument
*/
x86.RegAllocMap.prototype.getArgSlot = function (argIdx)
{
    assert (
        argIdx < this.argMap.length,
        'invalid argument index'
    );

    return this.argMap[argIdx];
}

/**
Get a memory operand from a stack slot index. The number of spill slots
is used to compute the offset from the current stack pointer.
*/
x86.RegAllocMap.prototype.getSlotOpnd = function (slotIdx)
{
    // Compute the total number of stack slots
    var numSlots = this.numArgSlots + 1 + this.numSpillSlots;

    assert (
        slotIdx < numSlots,
        'invalid stack slot index: ' + slotIdx + ', num slots:' + numSlots
    );
    
    // Compute the offset relative to the stack pointer
    var offset = (slotIdx + 1 - numSlots) * this.slotSize;

    // Return the memory location
    return new x86.MemLoc(
        this.slotSize * 8,
        this.spReg,
        offset
    );
}

/**
Allocate a value to a register or spill slot
*/
x86.RegAllocMap.prototype.makeAlloc = function (value, alloc)
{
    assert (
        value === undefined ||
        value instanceof IRValue ||
        value instanceof x86.Register,
        'invalid value in allocReg: ' + value
    );

    assert (
        isNonNegInt(alloc) ||
        (alloc instanceof x86.Register && alloc.type === 'gp'),
        'invalid allocation: ' + alloc
    );

    var name;
    if (value === undefined)
        valName = undefined;
    else if (value.getValName !== undefined)
        valName = value.getValName();
    else
        valName = value.toString();
    log.debug(alloc + ' -> ' + valName);

    // If the allocation is to a register
    if (alloc instanceof x86.Register)
    {
        // Get the value the register previously mapped to
        var prevRegVal = this.regMap[alloc.regNo];

        // Remove the allocation of the previous value to the register
        if (prevRegVal !== undefined)
            this.remAlloc(prevRegVal, alloc);

        // Update the register's value
        this.regMap[alloc.regNo] = value;
    }
    else
    {
        // Get the value the stack slot previously mapped to
        var prevSlotVal = this.stackMap[alloc];

        // Remove the allocation of the previous value to the spill slot
        if (prevSlotVal !== undefined)
            this.remAlloc(prevSlotVal, alloc);

        // Update the stack slot's value
        this.stackMap.setItem(alloc, value);
    }

    // Get the alloc set for this value
    var allocSet;
    if (this.allocMap.hasItem(value) === false)
    {
        var allocSet = [];
        this.allocMap.addItem(value, allocSet);
    }
    else
    {
        allocSet = this.allocMap.getItem(value);
    }

    // Add the new allocation to the set
    arraySetAdd(allocSet, alloc);
}

/**
Remove a value from the allocation map
*/
x86.RegAllocMap.prototype.remAlloc = function (value, alloc)
{
    assert (
        value instanceof IRValue ||
        value instanceof x86.Register,
        'invalid value in remAlloc: ' + value
    );

    if (this.allocMap.hasItem(value) === false)
        return;

    var allocSet = this.allocMap.getItem(value);

    assert (
        arraySetHas(allocSet, alloc),
        'allocation not in set: ' + alloc
    );

    arraySetRem(allocSet, alloc);

    if (alloc instanceof x86.Register)
        this.regMap[alloc.regNo] = undefined;
    else
        this.stackMap.setItem(alloc, undefined);
}

/**
Remove all allocations for a value from the allocation map
*/
x86.RegAllocMap.prototype.remAllocs = function (value)
{
    assert (
        value instanceof IRValue ||
        value instanceof x86.Register,
        'invalid value in remAllocs: ' + value
    );

    if (this.allocMap.hasItem(value) === false)
        return;

    var allocSet = this.allocMap.getItem(value);

    for (var i = 0; i < allocSet.length; ++i)
    {
        var alloc = allocSet[i];

        if (alloc instanceof x86.Register)
            this.regMap[alloc.regNo] = undefined;
        else
            this.stackMap.setItem(alloc, undefined);
    }

    allocSet.length = 0;
}

/**
Spill a value on the stack.
*/
x86.RegAllocMap.prototype.spillValue = function (value, liveSet, asm)
{
    var stackSlot = undefined;

    // For each stack slot
    for (var itr = this.stackMap.getItr(); itr.valid(); itr.next())
    {
        var itrVal = itr.get();
        var alloc = itr.key;
        var curVal = itr.value;

        // If this spill slot is free, or assigned to a dead value
        if (curVal === undefined || 
            (liveSet.hasItem(curVal) === false && 
             (curVal instanceof x86.Register) === false))
        {
            stackSlot = alloc;
            break;
        }
    }

    // If no free stack slot was found
    if (stackSlot === undefined)
    {
        log.debug('Creating new stack slot');

        // Get a new spill slot index
        stackSlot = this.allocSpill(asm);
    }

    // Allocate the value to the stack slot
    this.makeAlloc(value, stackSlot);

    return stackSlot;
}

/**
Get the value a register maps to
*/
x86.RegAllocMap.prototype.getRegVal = function (reg)
{
    assert (
        reg instanceof x86.Register && reg.type === 'gp',
        'invalid register'
    );

    return this.regMap[reg.regNo];
}

/**
Get the value an allocation maps to
*/
x86.RegAllocMap.prototype.getAllocVal = function (alloc)
{
    if (alloc instanceof x86.Register && alloc.type === 'gp')
    {
        return this.regMap[alloc.regNo];
    }
    else if (typeof alloc === 'number')
    {
        if (this.stackMap.hasItem(alloc) === true)
            return this.stackMap.getItem(alloc);

        return undefined;
    }

    error('invalid allocation: ' + alloc);
}

/**
Get the allocation set for a value.
*/
x86.RegAllocMap.prototype.getAllocs = function (value)
{
    assert (
        value instanceof IRValue,
        'invalid value in getAlloc: ' + value
    );

    if (this.allocMap.hasItem(value) === true)
        return this.allocMap.getItem(value);
    else
        return [];
}

/**
Compute the size of a constant value if it were to be
used as an immediate.
*/
x86.getImmSize = function (value, params)
{
    // If the value is not a constant, stop
    if ((value instanceof ConstValue) === false)
        return undefined;

    // If the value is not an immediate integer, stop
    if (value.isInt() === false &&
        value.value !== undefined &&
        value.value !== true &&
        value.value !== false &&
        value.value !== null)
        return undefined;

    // Get the immediate bits for the value
    var immVal = value.getImmValue(params);

    // Compute the smallest size this immediate fits in
    var size;
    if (num_ge(immVal, getIntMin(8)) && num_le(immVal, getIntMax(8)))
        size = 8;
    else if (num_ge(immVal, getIntMin(16)) && num_le(immVal, getIntMax(16)))
        size = 16;
    else if (num_ge(immVal, getIntMin(32)) && num_le(immVal, getIntMax(32)))
        size = 32;
    else
        size = 64;

    // Return the size
    return size;
}

/**
Test if an IR value must be handled at link-time
*/
x86.isLinkValue = function (value)
{
    return (
        value instanceof IRFunction ||
        (value instanceof ConstValue && value.isString())
    );
}


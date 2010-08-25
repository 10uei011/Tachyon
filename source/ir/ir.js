/**
@fileOverview
Intermediate Representation (IR) translation implementation

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

// TODO: Explain result of translation in function description comments 

// TODO: handle eval
// - Make all local vars shared cells
// - Need to store params in shared cells too

// TODO: fix scope of catch variable
// TODO: use id directly (unique) instead of variable name?

// TODO: consider eliminating untyped if?

/**
Convert an AST code unit into IR functions
*/
function unitToIR(
    astUnit
)
{
    //
    // Top level AST may contain functions and statements...
    // Top level AST is somewhat like a function of its own
    //
    // Parse into a top-level AST function per code unit
    // - Only called once
    //   - This ptr is always the global object
    // - Inner functions are nested
    // - Has variable declarations which are global...
    //   - Indicated by symbol resolution of AST
    // - Return value is irrelevant
    //   - Return is actually illegal at global scope
    //

    // Ensure that the top-level AST is a program
    assert (astUnit instanceof Program, 'top-level AST must be program');

    // Treat the top-level unit as a function
    return stmtListToIRFunc(
        '',
        null,
        [],
        [],
        [],
        [],
        [],
        astUnit.funcs,
        astUnit.block.statements,
        astUnit
    );
}

/**
Convert an AST function into an IR function
*/
function funcToIR(
    funcName,
    parentFunc,
    astFunc
)
{
    // Ensure that the top-level AST is a program
    assert (astFunc instanceof FunctionExpr, 'function must be AST function expression');

    // Compile the function
    return stmtListToIRFunc(
        funcName, 
        parentFunc,
        astFunc.params,
        astFunc.vars,
        astFunc.free_vars,
        astFunc.clos_vars,
        astFunc.esc_vars,
        astFunc.funcs,
        astFunc.body,
        astFunc
    );
}

/**
Convert an AST statement list into an IR function
*/
function stmtListToIRFunc(
    funcName, 
    parentFunc,
    params,
    localVars,
    freeVars,
    closureVars,
    escapeVars,
    nestedFuncs,
    bodyStmts,
    astNode
)
{
    // Extract the argument names
    var argVars = [];
    for (var i in params)
        argVars.push(params[i].toString());

    // Extract the closure variable names
    var closVars = [];
    for (var i in closureVars)
        closVars.push(closureVars[i].toString());

    // Create a new function object for the function
    var newFunc = new IRFunction(
        funcName,
        argVars,
        closVars,
        parentFunc,
        astNode
    );

    // Verify if the function may be using the arguments object or eval
    if (astNode.usesArguments)
        newFunc.usesArguments = true;
    if (astNode.usesEval)
        newFunc.usesEval = true;

    // Create a new CFG for the function
    var cfg = new ControlFlowGraph(newFunc);

    // Set the CFG for the function
    newFunc.virginCFG = cfg;

    // Get the entry block for the CFG
    var entryBlock = cfg.getEntryBlock();

    // Add an instruction to get the function object argument
    var funcObj = new ArgValInstr('funcObj', 0);
    entryBlock.addInstr(funcObj, 'funcObj');

    // Add an instruction to get the this value argument
    var thisVal = new ArgValInstr('thisVal', 1);
    entryBlock.addInstr(thisVal, 'this');

    // Create a map for the closure and escaping variable mutable cells
    var sharedMap = new HashMap();

    // For each closure variable
    for (var i = 0; i < closVars.length; ++i)
    {
        var symName = closVars[i];

        // Get the corresponding mutable cell from the closure
        var closCell = entryBlock.addInstr(
            new GetClosInstr(funcObj, ConstValue.getConst(i))
        );

        // Add the mutable cell to the shared variable map
        sharedMap.addItem(symName, closCell);
    }

    // For each escaping variable
    for (var i in escapeVars)
    {
        var symName = escapeVars[i].toString();

        // If this variable is not already provided by the local function object
        if (!sharedMap.hasItem(symName))
        {
            // Create a new mutable cell for this variable
            var newCell = entryBlock.addInstr(new MakeCellInstr());

            // Map the variable to the mutable cell
            sharedMap.addItem(symName, newCell);
        }
    }

    // Create a map for the local variable storage locations
    var localMap = new HashMap();

    // For each function argument
    for (var i = 0; i < params.length; ++i)
    {
        var symName = params[i].toString();

        // Create an instruction to get the argument value
        var argVal = new ArgValInstr(symName, 2 + i);
        entryBlock.addInstr(argVal, symName);

        // If there is no entry in the shared map                    context.globalObj
        if (!sharedMap.hasItem(symName))
        {
            // Add the argument value directly to the local map
            localMap.addItem(symName, argVal);
        }
        else
        {
            // Put the argument value in the corresponding mutable cell
            var mutCell = sharedMap.getItem(symName);
            entryBlock.addInstr(new PutCellInstr(mutCell, argVal));
        }
    }

    // Create the arguments object and add it to the variable map
    var argObj = new MakeArgObjInstr(funcObj);
    entryBlock.addInstr(argObj, 'argObj');
    localMap.addItem('arguments', argObj);

    // Add an instruction to get the global object from the function object
    var globalObj = new GetGlobalInstr(funcObj);
    entryBlock.addInstr(globalObj, 'global');

    // For each local variable declaration
    for (var i in localVars)
    {
        var symName = localVars[i].toString();

        // If there is no shared map or local map entry, add an undefined value
        if (!sharedMap.hasItem(symName) && !localMap.hasItem(symName))
            localMap.addItem(symName, ConstValue.getConst(undefined));
    }

    // Create a context for the function body
    var bodyContext = new IRConvContext(
        bodyStmts, 
        entryBlock,
        null,
        localMap,
        sharedMap,
        new HashMap(),
        new HashMap(),
        null,
        cfg,
        funcObj,
        thisVal,
        globalObj
    );

    // For each nested function
    for (var i in nestedFuncs)
    {
        var nestFuncAst = nestedFuncs[i];

        var nestFuncName;
        var nestFuncExpr;

        if (nestFuncAst instanceof FunctionDeclaration)
        {
            nestFuncName = nestFuncAst.id.toString();
            nestFuncExpr = nestFuncAst.funct;
        }
        else
        {
            nestFuncName = 'anon_' + (stmtListToIRFunc.nextAnonNum)++;
            nestFuncExpr = nestFuncAst;
        }

        // Compile the nested function to IR
        var nestFunc = funcToIR(
            nestFuncName,
            newFunc,
            nestFuncExpr
        );
        
        // Make the new function a child of the function being compiled
        newFunc.addChildFunc(nestFunc);

        // If the nested function is a function declaration
        if (nestFuncAst instanceof FunctionDeclaration)
        {
            // Create a list for the closure variable values
            var closVals = [];

            // For each closure variable of the new function
            for (var i = 0; i < nestFunc.closVars.length; ++i)
            {
                var symName = nestFunc.closVars[i];

                // Add the variable to the closure variable values
                closVals.push(sharedMap.getItem(symName));
            }

            // Create a closure for the function
            var closVal = entryBlock.addInstr(
                new MakeClosInstr(
                    nestFunc,
                    globalObj,
                    closVals
                )
            );

            // If the current function is a unit level function
            if (astNode instanceof Program)
            {
                // Bind the nested function name in the global environment
                insertCallIR(
                    bodyContext,
                    new PutPropValInstr(
                        globalObj,
                        ConstValue.getConst(nestFuncName),
                        closVal
                    )
                );
            }
            else
            {
                // Map the function name to the closure in the local variable map
                localMap.setItem(nestFuncName, closVal);
            }
        }
    }

    // Generate code for the function body
    stmtListToIR(bodyContext);

    // If the context is not terminated
    if (!bodyContext.isTerminated())
    {
        // Add a return undefined instruction to the exit block
        bodyContext.addInstr(
            new RetInstr(ConstValue.getConst(undefined))
        );
    }

    //print(cfg);
    //print('');

    // Simplify the CFG
    cfg.simplify();
    
    // Run a validation test on the CFG
    try
    {
        cfg.validate();
    }
    catch (e)
    {
        error(
            'Invalid CFG for function "' + funcName + '":\n' + 
            e + '\n' + cfg.toString()
        );
    }

    // Return the new function
    return newFunc;
}

/**
Next number to be assigned to an anonymous function
*/
stmtListToIRFunc.nextAnonNum = 0;

/**
@class IR Conversion context
*/
function IRConvContext(
    astNode, 
    entryBlock,
    withVal, 
    localMap,
    sharedMap,
    breakMap, 
    contMap,
    throwList,
    cfg,
    funcObj,
    thisVal,
    globalObj
)
{
    // Ensure that the arguments are valid
    assert (
        astNode !== undefined,
        'ast node not defined in IR conversion context'
    );
    assert (
        entryBlock !== undefined && entryBlock instanceof BasicBlock,
        'entry block not defined or invalid in IR conversion context'
    );
    assert (
        withVal !== undefined,
        'with context value not defined in IR conversion context'
    );
    assert (
        localMap !== undefined,
        'local variable map not defined in IR conversion context'
    );
    assert (
        sharedMap !== undefined,
        'shared variable map not defined in IR conversion context'
    );
    assert (
        breakMap !== undefined,
        'break map not defined in IR conversion context'
    );
    assert (
        contMap !== undefined,
        'continue map not defined in IR conversion context'
    );
    assert (
        throwList !== undefined,
        'throw list not defined in IR conversion context'
    );
    assert (
        cfg !== undefined && cfg instanceof ControlFlowGraph,
        'CFG not defined or invalid in IR conversion context'
    );
    assert (
        funcObj instanceof IRValue,
        'invalid function object in IR conversion context'
    );
    assert (
        thisVal instanceof IRValue,
        'invalid this value in IR conversion context'
    );
    assert (
        globalObj instanceof IRValue,
        'invalid global object in IR conversion context'
    );

    /**
    AST node to convert
    @field
    */
    this.astNode = astNode;

    /**
    Entry block at which to begin IR stream output
    @field
    */
    this.entryBlock = entryBlock;

    /**
    With context value
    @field
    */
    this.withVal = withVal;

    /**
    Mutable map of local variable states
    @field
    */
    this.localMap = localMap;

    /**
    Map of shared variable locations
    @field
    */
    this.sharedMap = sharedMap;

    /**
    Break context lists map
    @field
    */
    this.breakMap = breakMap;

    /**
    Continue context lists map
    @field
    */
    this.contMap = contMap;

    /**
    Throw context list
    @field
    */
    this.throwList = throwList;

    /**
    Control-flow graph to which the generate code belongs
    @field
    */
    this.cfg = cfg;

    /**
    Function object value
    @field
    */
    this.funcObj = funcObj;

    /**
    This argument value
    @field
    */
    this.thisVal = thisVal;

    /**
    Global object instance
    @field
    */
    this.globalObj = globalObj;

    /**
    Current basic block at the output
    @field
    */
    this.exitBlock = undefined;

    /**
    Output value of the evaluated AST node
    @field
    */
    this.outValue = undefined;
}
IRConvContext.prototype = {};

/**
Set the output of the IR conversion
*/
IRConvContext.prototype.setOutput = function (exitBlock, outValue)
{
    // Ensure that the arguments are valid
    assert (
        exitBlock !== undefined,
        'exit block not defined for IR conversion context output'
    );
    assert (
        outValue === undefined || outValue instanceof IRValue,
        'invalid value specified for IR conversion context output'
    );

    this.exitBlock = exitBlock;

    this.outValue = outValue;
};

/**
Terminate a context so it cannot be pursued
*/
IRConvContext.prototype.terminate = function ()
{
    this.exitBlock = null;
};

/**
Bridge a context with no exit block
*/
IRConvContext.prototype.bridge = function ()
{
    this.exitBlock = this.entryBlock;
};

/**
Get the exit block from a conversion context
*/
IRConvContext.prototype.getExitBlock = function ()
{
    // Ensure that the output was set
    assert (
        this.exitBlock !== undefined,
        'cannot get exit block from conversion context, output not set'
    );

    return this.exitBlock;
};

/**
Get the output value from a conversion context
*/
IRConvContext.prototype.getOutValue = function ()
{
    // Ensure that the output was set
    assert (
        this.outValue instanceof IRValue,
        'cannot get output value from conversion context, output not set'
    );

    return this.outValue;
};

/**
Test if a context is terminated
*/
IRConvContext.prototype.isTerminated = function (astNode)
{
    return this.exitBlock === null;
};

/**
Create a new context to pursue the conversion of a sequential
unit of code for which a previous context exits
*/
IRConvContext.prototype.pursue = function (astNode)
{
    // Ensure that the context is not terminated
    assert (
        !this.isTerminated(),
        'cannot pursue terminated context'
    );

    return new IRConvContext(
        astNode,
        (this.exitBlock !== undefined)? this.exitBlock:this.entryBlock,
        this.withVal,
        this.localMap,
        this.sharedMap,
        this.breakMap,
        this.contMap,
        this.throwList,
        this.cfg,
        this.funcObj,
        this.thisVal,
        this.globalObj
    );
};

/**
Create a new context for the conversion of a branch
*/
IRConvContext.prototype.branch = function (
    astNode,
    entryBlock,
    localMap
)
{
    return new IRConvContext(
        astNode,
        entryBlock,
        this.withVal,
        localMap,
        this.sharedMap,
        this.breakMap,
        this.contMap,
        this.throwList,
        this.cfg,
        this.funcObj,
        this.thisVal,
        this.globalObj
    );
};

/**
Add an instruction at the end of the current block of this context
*/
IRConvContext.prototype.addInstr = function (instr, outName)
{
    var insBlock = this.exitBlock? this.exitBlock:this.entryBlock;

    insBlock.addInstr(instr, outName);

    return instr;
}

/**
Convert a statement list to IR code
*/
function stmtListToIR(context)
{
    // Ensure that the IR conversion context is valid
    assert (
        context instanceof IRConvContext,
        'invalid IR conversion context specified'
    );

    var stmtList = context.astNode;

    // Bridge the current context, in case the statement list is empty
    context.bridge();

    // The current statement context is the entry context
    var curContext = context;

    // For each statement
    for (var i = 0; i < stmtList.length; ++i)
    {
        var stmt = stmtList[i];

        // Pursue the context for the statement
        curContext = curContext.pursue(stmt);

        // Generate code for the statement
        stmtToIR(curContext);

        // If the context is terminated, stop
        if (curContext.isTerminated())
            break;
    }

    // The exit block is the current exit block
    context.setOutput(curContext.getExitBlock());
}

/**
Convert an AST statement into IR code
*/
function stmtToIR(context)
{
    // Ensure that the IR conversion context is valid
    assert (
        context instanceof IRConvContext,
        'invalid IR conversion context specified'
    );

    // Get a reference to the statement
    var astStmt = context.astNode;

    // If the statement is a function declaration
    if (astStmt instanceof FunctionDeclaration)
    {
        // Do nothing
        context.bridge();
    }

    else if (astStmt instanceof BlockStatement)
    {
        // Compile the statement list
        var blockContext = context.pursue(astStmt.statements);
        stmtListToIR(blockContext);
        context.setOutput(blockContext.getExitBlock());
    }

    else if (astStmt instanceof ConstStatement)
    {
        assert (false, 'ConstStatement not implemented');
    }

    else if (astStmt instanceof ExprStatement)
    {
        // Compile the expression
        var exprContext = context.pursue(astStmt.expr);
        exprToIR(exprContext);
        context.setOutput(exprContext.getExitBlock());
    }

    else if (astStmt instanceof IfStatement)
    {
        // TODO: conversion to boolean, need ToBoolean()
        // False is: null, undefined, 0, NaN, ''
        // Could implement tobool instruction? Or leave this as detail for lower level conversion
        //
        // PROBABLY best to have explicit conversions which get removed later
        // These map to inlinable functions which have different cases for each type
        //
        // What about indexing and ToString!? We don't actually want a string!
        // Could possibly have custom tokey conversion... Or no conversion,
        // getprop_val already implies complex underlying algorithm, unlike if test

        // If the test expression is an inline conditional IR instruction
        if (isCondInlineIR(astStmt))
        {
            // Generate the inline IR instruction
            genCondInlineIR(context);

            // Exit early
            return;
        }

        // Compile the test expression
        var testContext = context.pursue(astStmt.expr);        
        exprToIR(testContext);

        // Create a context for the true statement
        var trueContext = context.branch(
            astStmt.statements[0],
            context.cfg.getNewBlock('if_true'),
            testContext.localMap.copy()
        );

        // Create a context for the false statement
        var falseContext = context.branch(
            astStmt.statements[1]? astStmt.statements[1]:null,
            context.cfg.getNewBlock('if_false'),
            testContext.localMap.copy()
        );

        // Compile the true statement
        stmtToIR(trueContext);

        // Compile the false statement, if it is defined
        if (astStmt.statements.length > 1)
            stmtToIR(falseContext);
        else
            falseContext.bridge();

        // Merge the local maps using phi nodes
        var joinBlock = mergeContexts(
            [trueContext, falseContext],
            context.localMap,
            context.cfg,
            'if_join'
        );

        // Create the if branching instruction
        testContext.addInstr(
            new IfInstr(
                testContext.getOutValue(),
                trueContext.entryBlock,
                falseContext.entryBlock
            )
        );

        // Set the exit block to be the join block
        context.setOutput(joinBlock);
    }

    else if (astStmt instanceof DoWhileStatement)
    {
        // Create a context for the loop entry (the loop body)
        var entryLocals = new HashMap();
        var brkCtxList = [];
        var cntCtxList = [];
        var bodyContext = createLoopEntry(
            astStmt,
            astStmt.statement,
            context,
            entryLocals,
            brkCtxList,
            cntCtxList,
            'loop_body'
        );
              
        // Compile the loop body
        stmtToIR(bodyContext);

        // Add the body exit to the continue context list
        cntCtxList.push(bodyContext);

        // Merge the continue contexts
        var testLocals = new HashMap();
        var testEntry = mergeContexts(
            cntCtxList,
            testLocals,
            context.cfg,
            'loop_test'
        );

        // Compile the loop test
        var testContext = bodyContext.branch(
            astStmt.expr,
            testEntry,
            testLocals
        );
        exprToIR(testContext);

        // Add the test exit to the break context list
        brkCtxList.push(testContext);

        // Merge the break contexts
        var loopExit = mergeContexts(
            brkCtxList,
            context.localMap,
            context.cfg,
            'loop_exit'
        );

        // Replace the jump added by the context merging at the test exit
        // by the if branching instruction
        var testExit = testContext.getExitBlock();
        testExit.remBranch();
        testExit.addInstr(
            new IfInstr(
                testContext.getOutValue(),
                bodyContext.entryBlock,
                loopExit
            )
        );

        // Merge the test exit context with the loop entry
        mergeLoopEntry(
            [testContext],
            entryLocals,
            bodyContext.entryBlock
        );

        // Add a jump from the entry block to the loop entry
        context.addInstr(new JumpInstr(bodyContext.entryBlock));

        // Set the exit block to be the join block
        context.setOutput(loopExit);
    }

    else if (astStmt instanceof WhileStatement)
    {
        // Create a context for the loop entry (the loop test)
        var entryLocals = new HashMap();
        var brkCtxList = [];
        var cntCtxList = [];
        var testContext = createLoopEntry(
            astStmt,
            astStmt.expr,
            context,
            entryLocals,
            brkCtxList,
            cntCtxList,
            'loop_test'
        );

        // Compile the loop test in the entry context
        exprToIR(testContext);

        // Compile the body statement
        var bodyContext = testContext.branch(
            astStmt.statement,
            context.cfg.getNewBlock('loop_body'),
            testContext.localMap.copy()
        );
        stmtToIR(bodyContext);

        // Add the test exit to the entry context list
        brkCtxList.push(testContext);

        // Add the body exit to the continue context list
        cntCtxList.push(bodyContext);  

        // Merge the continue contexts with the loop entry
        mergeLoopEntry(
            cntCtxList,
            entryLocals,
            testContext.entryBlock
        );

        // Merge the break contexts
        var loopExit = mergeContexts(
            brkCtxList,
            context.localMap,
            context.cfg,
            'loop_exit'
        );

        // Replace the jump added by the context merging at the test exit
        // by the if branching instruction
        var testExit = testContext.getExitBlock();
        testExit.remBranch();
        testExit.addInstr(
            new IfInstr(
                testContext.getOutValue(),
                bodyContext.entryBlock,
                loopExit
            )
        );       

        // Add a jump from the entry block to the loop entry
        context.addInstr(new JumpInstr(testContext.entryBlock));

        // Set the exit block to be the join block
        context.setOutput(loopExit);
    }

    else if (astStmt instanceof ForStatement)
    {
        // Compile the loop initialization expression
        var initContext = context.pursue(astStmt.expr1);
        exprToIR(initContext);

        // Create a context for the loop entry (the loop test)
        var entryLocals = new HashMap();
        var brkCtxList = [];
        var cntCtxList = [];
        var testContext = createLoopEntry(
            astStmt,
            astStmt.expr2,
            initContext,
            entryLocals,
            brkCtxList,
            cntCtxList,
            'loop_test'
        );

        // Compile the loop test in the entry context
        exprToIR(testContext);

        // Compile the body statement
        var bodyContext = testContext.branch(
            astStmt.statement,
            context.cfg.getNewBlock('loop_body'),
            testContext.localMap.copy()
        );
        stmtToIR(bodyContext);

        // Add the test exit to the entry context list
        brkCtxList.push(testContext);

        // Add the body exit to the continue context list
        cntCtxList.push(bodyContext); 

        // Merge the break contexts
        var incrLocals = new HashMap();
        var loopIncr = mergeContexts(
            cntCtxList,
            incrLocals,
            context.cfg,
            'loop_incr'
        );

        // Compile the loop incrementation
        var incrContext = testContext.branch(
            astStmt.expr3,
            loopIncr,
            incrLocals
        );
        exprToIR(incrContext);

        // Merge the continue contexts with the loop entry
        mergeLoopEntry(
            [incrContext],
            entryLocals,
            testContext.entryBlock
        );
        
        // Merge the break contexts
        var loopExit = mergeContexts(
            brkCtxList,
            context.localMap,
            context.cfg,
            'loop_exit'
        );

        // Replace the jump added by the context merging at the test exit
        // by the if branching instruction
        var testExit = testContext.getExitBlock();
        testExit.remBranch();
        testExit.addInstr(
            new IfInstr(
                testContext.getOutValue(),
                bodyContext.entryBlock,
                loopExit
            )
        );       

        // Add a jump from the entry block to the loop entry
        initContext.addInstr(new JumpInstr(testContext.entryBlock));

        // Set the exit block to be the join block
        context.setOutput(loopExit);
    }

    else if (astStmt instanceof ForInStatement)
    {
        // Compile the set expression
        var setCtx = context.pursue(astStmt.set_expr);
        exprToIR(setCtx);

        // Get the property names of the set object
        var propNameArr = setCtx.addInstr(
            new GetPropNamesInstr(
                setCtx.getOutValue()
            )
        );

        // Get the length of the property name array minus one
        var numPropNames = insertCallIR(
            setCtx,
            new GetPropValInstr(
                propNameArr,
                ConstValue.getConst('length')
            )
        );
        var numPropNamesMin1 = setCtx.addInstr(
            new SubInstr(
                numPropNames,
                ConstValue.getConst(1)
            )
        );

        // Create a context for the loop entry (the loop test)
        var entryLocals = new HashMap();
        var brkCtxList = [];
        var cntCtxList = [];
        var testCtx = createLoopEntry(
            astStmt,
            astStmt,
            setCtx,
            entryLocals,
            brkCtxList,
            cntCtxList,
            'loop_test'
        );

        // Create a phi node for the current property index
        var propIndex = testCtx.addInstr(
            new PhiInstr(
                [numPropNamesMin1],
                [setCtx.getExitBlock()]
            )
        );

        // Test that the current property index is valid
        var testVal = testCtx.addInstr(
            new GteInstr(
                propIndex,
                ConstValue.getConst(0)
            )
        );
      
        // Bridge the test context
        testCtx.bridge();
  
        // Create a context for the loop body
        var bodyCtx = testCtx.branch(
            astStmt.lhs_expr,
            context.cfg.getNewBlock('loop_body'),
            testCtx.localMap.copy()
        );
        
        // Get the current property
        var curPropName = insertCallIR(
            bodyCtx,
            new GetPropValInstr(
                propNameArr,
                propIndex
            )
        );
        
        // Assign the current prop name to LHS expr
        assgToIR(bodyCtx, curPropName);

        // Compile the loop body statement
        var bodyStmtCtx = bodyCtx.pursue(astStmt.statement);
        stmtToIR(bodyStmtCtx);

        // Add the test exit to the break context list
        brkCtxList.push(testCtx);

        // Add the body exit to the continue context list
        cntCtxList.push(bodyStmtCtx); 

        // Merge the break contexts
        var incrLocals = new HashMap();
        var loopIncr = mergeContexts(
            cntCtxList,
            incrLocals,
            context.cfg,
            'loop_incr'
        );

        // Create a context for the loop incrementation
        var incrContext = testCtx.branch(
            astStmt,
            loopIncr,
            incrLocals
        );

        // Compute the current property index - 1
        var incrVal = incrContext.addInstr(
            new SubInstr(
                propIndex,
                ConstValue.getConst(1)
            )
        );

        // Add an incoming value to the property index phi node
        propIndex.addIncoming(incrVal, incrContext.entryBlock);

        // Bridge the incrementation context
        incrContext.bridge();

        // Merge the continue contexts with the loop entry
        mergeLoopEntry(
            [incrContext],
            entryLocals,
            testCtx.entryBlock
        );
        
        // Merge the break contexts
        var loopExit = mergeContexts(
            brkCtxList,
            context.localMap,
            context.cfg,
            'loop_exit'
        );

        // Replace the jump added by the context merging at the test exit
        // by the if branching instruction
        var testExit = testCtx.getExitBlock();
        testExit.remBranch();
        testExit.addInstr(
            new IfInstr(
                testVal,
                bodyCtx.entryBlock,
                loopExit
            )
        );       

        // Add a jump from the entry block to the loop entry
        setCtx.addInstr(new JumpInstr(testCtx.entryBlock));

        // Set the exit block to be the join block
        context.setOutput(loopExit);
    }

    else if (astStmt instanceof ContinueStatement)
    {
        // Get the label, if one was specified
        var label = astStmt.label? astStmt.label.toString():'';

        // Create a new context and bridge it
        var newContext = context.pursue(context.astNode);
        newContext.bridge();

        // If there is a continue list for this label
        if (context.contMap.hasItem(label))
        {
            // Add the new context to the list corresponding to this label
            context.contMap.getItem(label).push(newContext);

            // Terminate the current context, no instructions go after this
            context.terminate();
        }
        else
        {
            // Generate code to throw a syntax error
            errorToIR(
                context,
                newContext,
                SyntaxError,
                'continue with invalid context'
            );
        }
    }

    else if (astStmt instanceof BreakStatement)
    {
        // Get the label, if one was specified
        var label = astStmt.label? astStmt.label.toString():'';

        // Create a new context and bridge it
        var newContext = context.pursue(context.astNode);
        newContext.bridge();

        // If there is a break list for this label
        if (context.breakMap.hasItem(label))
        {
            // Add the new context to the list corresponding to this label
            context.breakMap.getItem(label).push(newContext);

            // Terminate the current context, no instructions go after this
            context.terminate();
        }
        else
        {
            // Generate code to throw a syntax error
            errorToIR(
                context,
                newContext,
                SyntaxError,
                'break with invalid context'
            );
        }
    }

    else if (astStmt instanceof ReturnStatement)
    {
        // Compile the return expression
        var retContext = context.pursue(astStmt.expr);
        exprToIR(retContext);

        // Add a return instruction
        retContext.addInstr(new RetInstr(retContext.getOutValue()));

        // Indicate that there is no continuation for this context
        context.terminate();
    }

    else if (astStmt instanceof WithStatement)
    {       
        //
        // TODO: need toObject instruction?
        //

        // Compile the object expression
        var objContext = context.pursue(astStmt.expr);
        exprToIR(objContext);

        // Pursue the context for the statement
        var stmtContext = objContext.pursue(astStmt.statement);

        // Set the with value for the statement context
        stmtContext.withVal = objContext.getOutValue();

        // Compile the statement
        stmtToIR(stmtContext);

        // Set the exit block for the current context
        context.setOutput(stmtContext.getExitBlock());
    }

    else if (astStmt instanceof SwitchStatement)
    {
        // Get the label for this statement
        var label = astStmt.stmtLabel? astStmt.stmtLabel.toString():'';

        // Compile the switch expression
        var switchCtx = context.pursue(astStmt.expr);        
        exprToIR(switchCtx);

        // Create a list for the break contexts
        var brkCtxList = [];

        // Create a break context map
        var breakMap = context.breakMap.copy();
        breakMap.setItem(label, brkCtxList);
        breakMap.setItem('', brkCtxList);
        
        // Create a context for the first case test
        var nextTestCtx = context.branch(
            astStmt.clauses[0]? astStmt.clauses[0].expr:null,
            context.cfg.getNewBlock('switch_test_0'),
            switchCtx.localMap.copy()
        );

        // Make the entry jump to the first test
        context.addInstr(new JumpInstr(nextTestCtx.entryBlock));

        // Variable for the previous clause statements context
        var prevStmtCtx = null;

        // Variable for the default clause entry block
        var defaultEntry = null;

        // Local variable map for the default case entry
        var defaultLocals = null;

        // For each clause
        for (var i = 0; i < astStmt.clauses.length; ++i)
        {
            var clause = astStmt.clauses[i];
            var nextClause = astStmt.clauses[i + 1];
 
            // Get the context for the current test
            var curTestCtx = nextTestCtx;

            // Create a context for the next case test
            nextTestCtx = context.branch(
                nextClause? nextClause.expr:null,
                context.cfg.getNewBlock('switch_test_' + (i + 1)),
                curTestCtx.localMap.copy()
            );

            // If this is not the default clause
            if (clause.expr !== null)
            {
                // Generate code for the test expression
                exprToIR(curTestCtx);

                // Compare the testvalue with the switch value
                var testVal = curTestCtx.addInstr(
                    new SeqInstr(
                        curTestCtx.getOutValue(),
                        switchCtx.getOutValue()
                    )
                );

                // Merge the incoming contexts
                var caseLocals = curTestCtx.localMap.copy();
                var caseEntry = mergeContexts(
                    prevStmtCtx? [curTestCtx, prevStmtCtx]:[curTestCtx],
                    caseLocals,
                    context.cfg,
                    'switch_case_' + i
                );

                // Remove the branch introduced by the merge
                curTestCtx.getExitBlock().remBranch();

                // Create a new context for the clause statements
                var stmtCtx = context.branch(
                    clause.statements,
                    caseEntry,
                    caseLocals
                );
                stmtCtx.breakMap = breakMap;

                // Generate code for the statement
                stmtListToIR(stmtCtx);
            }

            // Otherwise, this is the default case
            else
            {
                // Bridge the test context
                curTestCtx.bridge();

                // The test evaluates to false
                var testVal = ConstValue.getConst(false);

                // Create a new context for the clause statements
                var stmtCtx = createLoopEntry(
                    astStmt,
                    clause.statements,
                    curTestCtx,
                    curTestCtx.localMap.copy(),
                    brkCtxList,
                    null,
                    'switch_case_' + i
                );

                // Store the local map for the default case entry
                defaultLocals = stmtCtx.localMap.copy();

                // Store the entry block for the default clause
                defaultEntry = stmtCtx.entryBlock;

                // Generate code for the statement
                stmtListToIR(stmtCtx);

                // If there was a previous statement, merge its locals at the
                // current clause statement entry
                if (prevStmtCtx && !prevStmtCtx.isTerminated())
                {
                    mergeLoopEntry(
                        [prevStmtCtx],
                        defaultLocals,
                        stmtCtx.entryBlock
                    );
                }
            }

            // Add the if test instruction
            curTestCtx.addInstr(
                new IfInstr(
                    testVal,
                    stmtCtx.entryBlock,
                    nextTestCtx.entryBlock
                )
            );

            // Update the previous statement context
            prevStmtCtx = stmtCtx;
        }

        // Bridge the last test context
        nextTestCtx.bridge();

        // If a default clause was specified
        if (defaultEntry)
        {
            // Merge the context from the default case into the default entry
            mergeLoopEntry(
                [nextTestCtx],
                defaultLocals,
                defaultEntry
            );
        }
        else
        {
            // Add the last test context to the break context list
            brkCtxList.push(nextTestCtx);
        }

        // Add the last clause context to the break context list
        brkCtxList.push(prevStmtCtx);

        // Merge the break contexts
        var switchExit = mergeContexts(
            brkCtxList,
            context.localMap,
            context.cfg,
            'switch_exit'
        );

        // Set the exit block to be the join block
        context.setOutput(switchExit);
    }    

    else if (astStmt instanceof LabelledStatement)
    {
        // Assign our label to the inner statement
        astStmt.statement.stmtLabel = astStmt.label;

        // Compile the inner statement
        var stmtContext = context.pursue(astStmt.statement);
        stmtToIR(stmtContext);
        context.setOutput(stmtContext.getExitBlock());
    }

    else if (astStmt instanceof ThrowStatement)
    {
        // Compile the throw expression
        var throwContext = context.pursue(astStmt.expr);
        exprToIR(throwContext);

        // Generate a throw instruction
        throwToIR(context, throwContext, throwContext.getOutValue());
    }

    else if (astStmt instanceof TryStatement)
    {
        // Create a list for all the throw contexts in the try body
        var throwCtxList = [];
               
        // Create a context for the try body
        var tryBodyCtx = context.pursue(astStmt.statement);
        tryBodyCtx.throwList = throwCtxList;

        // Compile the try body statement
        stmtToIR(tryBodyCtx);

        // Merge the throw contexts
        var catchLocals = context.localMap.copy();
        var catchBlock = mergeContexts(
            throwCtxList,
            catchLocals,
            context.cfg,
            'try_catch'
        );

        // For each throw context
        for (var c in throwCtxList)
        {
            var throwExit = throwCtxList[c].getExitBlock();

            // Get the last instruction (the throw instruction) in the block
            var throwInstr = throwExit.getLastInstr();

            // Set the throw target to the catch block
            throwInstr.setThrowTarget(catchBlock);

            // Make the catch block a successor of the throw block
            throwExit.addSucc(catchBlock);
            catchBlock.addPred(throwExit);
        }

        // Create a new context for the catch statement
        var catchCtx = context.branch(
            astStmt.catch_part.statement,
            catchBlock,
            catchLocals
        );

        // TODO: disabled until catch scope issues are fixed in parser
        /*
        // Create a new shared map for the catch block
        catchCtx.sharedMap = context.sharedMap.copy();

        // Set the exception value in a mutable cell
        var catchVal = catchBlock.addInstr(new CatchInstr());
        var catchCell = catchBlock.addInstr(new MakeCellInstr());
        catchBlock.addInstr(new PutCellInstr(catchCell, catchVal));
        catchCtx.sharedMap.setItem(astStmt.id.toString(), catchCell);
        */

        // Compile the catch statement
        stmtToIR(catchCtx);

        // Merge the finally contexts
        var finallyLocals = new HashMap();
        var finallyBlock = mergeContexts(
            [tryBodyCtx, catchCtx],
            finallyLocals,
            context.cfg,
            'try_finally'
        );

        // Create a context for the finally statement
        var finallyCtx = context.branch(
            astStmt.finally_part,
            finallyBlock,
            finallyLocals
        );

        // Compile the finally statement, if it is defined
        if (astStmt.finally_part)
            stmtToIR(finallyCtx);
        else
            finallyCtx.bridge();

        // The exit block is the exit of the finaly context
        context.setOutput(finallyCtx.getExitBlock());
    }

    else if (astStmt instanceof DebuggerStatement)
    {
        // This statement does nothing for now
        context.bridge();
    }

    else
    {
        pp (astStmt);
        assert (false, 'unsupported statement in IR translation');
    }
}

/**
Convert an AST expression list into IR code
@returns a list of values for the evaluated expressions
*/
function exprListToIR(context)
{
    // Ensure that the IR conversion context is valid
    assert (
        context instanceof IRConvContext,
        'invalid IR conversion context specified'
    );

    // Get the expression list
    var exprList = context.astNode;

    // Bridge the current context, in case the expression list is empty
    context.bridge();

    // The current context is the entry context
    var curContext = context;

    // Create a list for the expression values
    var exprVals = [];

    // For each expression
    for (var i = 0; i < exprList.length; ++i)
    {
        var expr = exprList[i];

        // Pursue the context for this expression
        curContext = curContext.pursue(expr);

        // Generate code for the argument expression
        exprToIR(curContext);

        // Add the expression's value to the list
        exprVals.push(curContext.getOutValue());
    }

    // The exit block is the current exit block
    context.setOutput(curContext.getExitBlock());

    // Return the expression value list
    return exprVals;
}

/**
Convert an AST expression into IR code
*/
function exprToIR(context)
{
    // Ensure that the IR conversion context is valid
    assert (
        context instanceof IRConvContext,
        'invalid IR conversion context specified'
    );

    // Get a reference to the expression
    var astExpr = context.astNode;

    if (astExpr instanceof FunctionExpr)
    {
        // Find the compiled nested function corresponding to this expression
        var curFunc = context.cfg.ownerFunc;
        var nestFunc = null;
        for (var f in curFunc.childFuncs)
            if (curFunc.childFuncs[f].astNode === astExpr)
                nestFunc = curFunc.childFuncs[f];

        // Ensure that he nested function was found
        assert (
            nestFunc != null,
            'nested function not found for function expression'
        );

        // Create a list for the closure variable values
        var closVals = [];

        // For each closure variable of the new function
        for (var i = 0; i < nestFunc.closVars.length; ++i)
        {
            var symName = nestFunc.closVars[i];

            // Add the variable to the closure variable values
            closVals.push(context.sharedMap.getItem(symName));
        }

        // Create a closure for the function
        var closVal = context.addInstr(
            new MakeClosInstr(nestFunc, context.globalObj, closVals)
        );

        // Set the output to the new closure
        context.setOutput(context.entryBlock, closVal);
    }

    else if (astExpr instanceof OpExpr)
    {
        // Compile the operator expression
        opToIR(context);
    }

    else if (astExpr instanceof NewExpr)
    {
        // Compile the function argument list
        var argsContext = context.pursue(astExpr.args);
        var argVals = exprListToIR(argsContext);

        // Generate code for the statement
        var funcContext = argsContext.pursue(astExpr.expr);
        exprToIR(funcContext);

        // Create a basic block for the call continuation
        var contBlock = context.cfg.getNewBlock('call_cont');

        // Create the construct instruction
        var exprVal = funcContext.addInstr(
            new ConstructRefInstr(
                funcContext.getOutValue(),
                argVals,
                contBlock
            )
        );

        // If we are in a try block
        if (context.throwList)
        {
            // Bridge the last context
            funcContext.bridge();

            // Add the new context to the list of throw contexts
            context.throwList.push(funcContext);
        }

        // Set the output
        context.setOutput(contBlock, exprVal);
    }

    else if (astExpr instanceof CallExpr)
    {
        // If this is an inline IR instruction
        if (isInlineIR(astExpr))
        {
            // Generate the inline IR instruction
            genInlineIR(context);

            // Exit early
            return;
        }

        // Compile the function argument list
        var argsContext = context.pursue(astExpr.args);
        var argVals = exprListToIR(argsContext);

        // Get a reference to the function expression
        var fnExpr = astExpr.fn;

        // Variable for the function value
        var funcVal;

        // Variable for the "this" value
        var thisVal;

        // Variable for the last context used
        var lastContext;

        // If the function expression is of the form x[y]
        if (fnExpr instanceof OpExpr && fnExpr == 'x [ y ]')
        {
            var thisExpr = fnExpr.exprs[0];
            var idxExpr = fnExpr.exprs[1];
    
            // Generate code for the "this" expression
            var thisContext = argsContext.pursue(thisExpr);
            exprToIR(thisContext);

            // Generate code for the index expression
            var idxContext = thisContext.pursue(idxExpr);
            exprToIR(idxContext);

            // Get the function property from the object
            funcVal = insertCallIR(
                idxContext,
                new GetPropValInstr(
                    thisContext.getOutValue(),
                    idxContext.getOutValue()
                )
            );

            // The this value is the result of the this expression evaluation
            thisVal = thisContext.getOutValue();

            lastContext = idxContext;
        }
        else
        {
            // Generate code for the statement
            var funcContext = argsContext.pursue(fnExpr);
            exprToIR(funcContext);
            funcVal = funcContext.getOutValue();

            // The this value is the global object
            thisVal = context.globalObj;

            lastContext = funcContext;
        }

        // Create the call instruction
        var exprVal = insertCallIR(
            lastContext,
            new CallRefInstr(
                funcVal,
                thisVal,
                argVals,
                contBlock
            )
        );

        // Set the output
        context.setOutput(lastContext.getExitBlock(), exprVal);
    }

    // Constant values
    else if (astExpr instanceof Literal)
    {
        var constValue;

        var constType = typeof astExpr.value;

        if (constType == 'string' || constType == 'number' || 
            constType == 'boolean' || constValue === null || 
            constValue === undefined)
        {
           constValue = ConstValue.getConst(astExpr.value);
        }
        else
        {
            assert (false, 'invalid constant value: ' + astExpr.value);
        }

        // Set the constant value as the output
        context.setOutput(context.entryBlock, constValue);
    }

    else if (astExpr instanceof ArrayLiteral)
    {
        // Compile the element value expressions
        var elemCtx = context.pursue(astExpr.exprs);
        var elemVals = exprListToIR(elemCtx);

        // Create a new array
        var newArray = elemCtx.addInstr(new NewArrayInstr());

        // Set the value of each element in the new array
        for (var i = 0; i < elemVals.length; ++i)
        {
            insertCallIR(
                elemCtx,
                new PutPropValInstr(
                    newArray,
                    ConstValue.getConst(i),
                    elemVals[i]
                )
            );
        }
        
        // Set the new array as the output
        context.setOutput(elemCtx.getExitBlock(), newArray);
    }

    else if (astExpr instanceof ObjectLiteral)
    {
        // Get the property names and values
        var propNames = astExpr.properties.map(function (v) { return v.name });
        var propValues = astExpr.properties.map(function (v) { return v.value });

        // Compile the property name expressions
        var nameCtx = context.pursue(propNames);
        var nameVals = exprListToIR(nameCtx);

        // Compile the property value expressions
        var valCtx = nameCtx.pursue(propValues);
        var valVals = exprListToIR(valCtx);

        // Create a new object
        var newObject = valCtx.addInstr(new NewObjectInstr());

        // Set the value of each property in the new object
        for (var i = 0; i < propNames.length; ++i)
        {
            var propName = nameVals[i];
            var propValue = valVals[i];

            insertCallIR(
                valCtx,
                new PutPropValInstr(
                    newObject,
                    propName,
                    propValue
                )
            );
        }
        
        // Set the new object as the output
        context.setOutput(valCtx.getExitBlock(), newObject);
    }

    // Symbol expression
    else if (astExpr instanceof Ref)
    {
        // Compile the expression
        var exprContext = context.pursue(astExpr);
        refToIR(exprContext);
        context.setOutput(exprContext.getExitBlock(), exprContext.getOutValue());
    }

    else if (astExpr instanceof This)
    {
        // Set the value of the this argument as output
        context.setOutput(
            context.entryBlock,
            context.thisVal
        );
    }

    else
    {
        pp(astExpr);
        assert (false, 'unsupported expression in AST->IR translation');
    }
}

/**
Convert ast operator expression nodes to IR
*/
function opToIR(context)
{
    // Ensure that the IR conversion context is valid
    assert (
        context instanceof IRConvContext,
        'invalid IR conversion context specified'
    );

    // Get references to the operator and the sub-expressions
    var op = context.astNode.op;
    var exprs = context.astNode.exprs;

    // Function to generate code for pre/post increment/decrement operations
    function prePostGen(instrClass, post)
    {
        // Get the variable expression
        var varExpr = exprs[0];

        // Generate IR for the assignee expression
        var fstContext = context.pursue(exprs[0]);
        exprToIR(fstContext);
        
        // Compute the incremented value
        var postVal = fstContext.addInstr(
            new instrClass(
                fstContext.getOutValue(),
                ConstValue.getConst(1)
            )
        );
    
        // Assign the incremented value to the variable
        var secContext = fstContext.pursue(varExpr);
        assgToIR(secContext, postVal);

        // Set the output to the pre or post value
        context.setOutput(
            secContext.getExitBlock(),
            post? postVal:fstContext.getOutValue()
        );
    }

    // Function to generate code for composite assignment expressions
    function compAssgGen(instrClass)
    {
        // Function to implement the operator code gen
        function opFunc(context, lhsVal)
        {
            // Generate IR for the rhs expression
            var rhsContext = context.pursue(exprs[1]);
            exprToIR(rhsContext);

            // Compute the added value
            var addVal = rhsContext.addInstr(
                new instrClass(
                    lhsVal,
                    rhsContext.getOutValue()
                )
            );

            context.setOutput(rhsContext.getExitBlock(), addVal);
        }
    
        // Assign the added value to the left expression
        var assgContext = context.pursue(exprs[0]);
        assgToIR(assgContext, opFunc);

        // Set the output to the original value
        context.setOutput(assgContext.getExitBlock(), assgContext.getOutValue());
    }

    // Function to generate code for generic unary/binary operators
    function opGen(instrClass)
    {
        // Compile the argument values
        var argsContext = context.pursue(exprs);
        var argVals = exprListToIR(argsContext);

        // Create the appropriate operator instruction
        var opVal = argsContext.addInstr(
            new instrClass(argVals)
        );

        // Set the operator's output value as the output
        context.setOutput(argsContext.getExitBlock(), opVal);
    }

    // Switch on the operator
    switch (op)
    {
        // If this is an assignment expression
        case 'x = y':
        {
            // Get the left and right expressions
            var leftExpr = exprs[0];
            var rightExpr = exprs[1];

            // Generate IR for the right expression
            var rightContext = context.pursue(rightExpr);
            exprToIR(rightContext);

            // Convert the assignment
            var leftContext = rightContext.pursue(leftExpr);
            assgToIR(leftContext, rightContext.getOutValue());

            // Set the output to that of the assignment
            context.setOutput(leftContext.getExitBlock(), leftContext.getOutValue());
        }
        break;

        // If this is a logical AND expression
        case 'x && y':
        {
            // Compile the first expression
            var fstContext = context.pursue(exprs[0])
            exprToIR(fstContext);

            // Compile the second expression
            var secContext = context.branch(
                exprs[1],
                context.cfg.getNewBlock('log_and_sec'),
                fstContext.localMap.copy()
            );
            exprToIR(secContext);

            // Create a block to join the contexts
            var joinBlock = context.cfg.getNewBlock('log_and_join');

            // Create blocks for the true and false cases
            var trueBlock = context.cfg.getNewBlock('log_and_true');
            var falseBlock = context.cfg.getNewBlock('log_and_false');
            trueBlock.addInstr(new JumpInstr(joinBlock));
            falseBlock.addInstr(new JumpInstr(joinBlock));

            // Create the first if branching instruction
            fstContext.addInstr(
                new IfInstr(
                    fstContext.getOutValue(),
                    secContext.entryBlock,
                    falseBlock
                )
            );

            // Create the second if branching instruction
            secContext.addInstr(
                new IfInstr(
                    secContext.getOutValue(),
                    trueBlock,
                    falseBlock
                )
            );

            // Create a phi node to merge the values
            var phiValue = joinBlock.addInstr(
                new PhiInstr(
                    [ConstValue.getConst(true), ConstValue.getConst(false)],
                    [trueBlock, falseBlock]
                )
            );

            // Set the exit block to be the join block
            context.setOutput(joinBlock, phiValue);
        }
        break;

        // If this is a logical OR expression
        case 'x || y':
        {
            // Compile the first expression
            var fstContext = context.pursue(exprs[0])
            exprToIR(fstContext);

            // Compile the second expression
            var secContext = context.branch(
                exprs[1],
                context.cfg.getNewBlock('log_or_sec'),
                fstContext.localMap.copy()
            );
            exprToIR(secContext);

            // Create a block to join the contexts
            var joinBlock = context.cfg.getNewBlock('log_or_join');

            // Create blocks for the true and false cases
            var trueBlock = context.cfg.getNewBlock('log_or_true');
            var falseBlock = context.cfg.getNewBlock('log_or_false');
            trueBlock.addInstr(new JumpInstr(joinBlock));
            falseBlock.addInstr(new JumpInstr(joinBlock));

            // Create the first if branching instruction
            fstContext.addInstr(
                new IfInstr(
                    fstContext.getOutValue(),
                    trueBlock,
                    secContext.entryBlock
                )
            );

            // Create the second if branching instruction
            secContext.addInstr(
                new IfInstr(
                    secContext.getOutValue(),
                    trueBlock,
                    falseBlock
                )
            );

            // Create a phi node to merge the values
            var phiValue = joinBlock.addInstr(
                new PhiInstr(
                    [ConstValue.getConst(true), ConstValue.getConst(false)],
                    [trueBlock, falseBlock]
                )
            );

            // Set the exit block to be the join block
            context.setOutput(joinBlock, phiValue);
        }
        break;
        
        // If this is a conditional operator expression
        case 'x ? y : z':
        {
            // Compile the test expression
            var testContext = context.pursue(exprs[0])
            exprToIR(testContext);

            // Compile the true expression
            var trueContext = context.branch(
                exprs[1],
                context.cfg.getNewBlock('cond_true'),
                testContext.localMap.copy()
            );
            exprToIR(trueContext);

            // Compile the false expression
            var falseContext = context.branch(
                exprs[2],
                context.cfg.getNewBlock('cond_false'),
                testContext.localMap.copy()
            );
            exprToIR(falseContext);

            // Create the if branching instruction
            testContext.addInstr(
                new IfInstr(
                    testContext.getOutValue(),
                    trueContext.entryBlock,
                    falseContext.entryBlock
                )
            );

            // Merge the local maps using phi nodes
            var joinBlock = mergeContexts(
                [trueContext, falseContext],
                context.localMap,
                context.cfg,
                'cond_join'
            );

            // Create a phi node to merge the values
            var phiValue = joinBlock.addInstr(
                new PhiInstr(
                    [trueContext.getOutValue(), falseContext.getOutValue()],
                    [trueContext.getExitBlock(), falseContext.getExitBlock()]
                )
            );

            // Set the exit block to be the join block
            context.setOutput(joinBlock, phiValue);
        }
        break;

        // If this is the comma operator
        case 'x , y':
        { 
            // Compile the argument values
            var argsContext = context.pursue(exprs);
            var argVals = exprListToIR(argsContext);

            // Set the second argument's output value as the output
            context.setOutput(argsContext.getExitBlock(), argVals[1]);
        }
        break;

        // If this is the unary minus operator
        case '- x':
        { 
            // Compile the argument values
            var argsContext = context.pursue(exprs);
            var argVals = exprListToIR(argsContext);

            // Subtract the argument value from the constant 0
            var opVal = argsContext.addInstr(
                new SubInstr(
                    ConstValue.getConst(0),
                    argVals[0]
                )
            );

            // Set the subtraction's output value as the output
            context.setOutput(argsContext.getExitBlock(), opVal);
        }
        break;

        // If this is the object indexing operator
        case 'x [ y ]':
        {
            // Compile the argument values
            var argsContext = context.pursue(exprs);
            var argVals = exprListToIR(argsContext);

            // Create the appropriate operator instruction
            var opVal = insertCallIR(
                argsContext,
                new GetPropValInstr(argVals[0], argVals[1])
            );

            // Set the operator's output value as the output
            context.setOutput(argsContext.getExitBlock(), opVal);
        }
        break;

        case '++ x':
        prePostGen(AddInstr, false);
        break;

        case '-- x':
        prePostGen(SubInstr, false);
        break;

        case 'x ++':
        prePostGen(AddInstr, true);     
        break;

        case '-- x':
        prePostGen(SubInstr, true);           
        break;

        case 'x += y':
        compAssgGen(AddInstr);
        break;

        case 'x + y':
        opGen(AddInstr);
        break;

        case 'x - y':
        opGen(SubInstr);
        break;

        case 'x * y':
        opGen(MulInstr);
        break;

        case 'x / y':
        opGen(DivInstr);
        break;

        case 'x % y':
        opGen(ModInstr);
        break;

        case '! x':
        opGen(LogNotInstr);
        break;

        case '~ x':
        opGen(BitNotInstr);
        break;

        case 'x & y':
        opGen(BitAndInstr);
        break;

        case 'x | y':
        opGen(BitOrInstr);
        break;

        case 'x ^ y':
        opGen(BitXorInstr);
        break;

        case 'x << y':
        opGen(LsftInstr);
        break;

        case 'x >> y':
        opGen(RsftInstr);
        break;

        case 'x >>> y':
        opGen(UrsftInstr);
        break;

        case 'x < y':
        opGen(LtInstr);
        break;

        case 'x <= y':
        opGen(LteInstr);
        break;

        case 'x > y':
        opGen(GtInstr);
        break;

        case 'x >= y':
        opGen(GteInstr);
        break;

        case 'x == y':
        opGen(EqInstr);
        break;

        case 'x != y':
        opGen(NeqInstr);
        break;

        case 'x === y':
        opGen(SeqInstr);
        break;

        case 'x !== y':
        opGen(NseqInstr);
        break;

        case 'typeof x':
        opGen(TypeOfInstr);
        break;

        case 'x instanceof y':
        opGen(InstOfInstr);
        break;

        default:
        {
            assert (false, 'Unsupported AST operation "' + op + '"');
        }
    }
}

/**
Convert an assignment expression to IR code
@param rhsVal value to assign or code gen function
*/
function assgToIR(context, rhsVal)
{
    // Ensure that the IR conversion context is valid
    assert (
        context instanceof IRConvContext,
        'invalid IR conversion context specified'
    );

    // Get the left side expression
    var leftExpr = context.astNode;

    // If the left-hand side is a simple variable name
    if (leftExpr instanceof Ref)
    {
        var symName = leftExpr.id.toString();   

        // If we are within a with block
        if (context.withVal)
        {
            // Add a has-property test on the object for the symbol name
            var hasTestVal = context.addInstr(
                new HasPropValInstr(
                    context.withVal,
                    ConstValue.getConst(symName)                
                )
            );

            // Context for the case where the with object has the property
            var propContext = context.branch(
                null,
                context.cfg.getNewBlock('with_prop'),
                context.localMap.copy()
            );

            // Context for the case where the object doesn't have the property
            var varContext = context.branch(
                null,
                context.cfg.getNewBlock('with_var'),
                context.localMap.copy()
            );

            // Add the if branch expression
            context.addInstr(
                new IfInstr(
                    hasTestVal,
                    propContext.entryBlock,
                    varContext.entryBlock
                )
            );
        }
        else
        {
            var varContext = context;
        }

        // If a RHS code gen function was specified
        if (rhsVal instanceof Function)
        {      
            // Declare a variable for the LHS value
            var lhsVal;
      
            // If the variable is global
            if (leftExpr.id.scope instanceof Program)
            {
                // Get the value from the global object
                lhsVal = insertCallIR(
                    varContext,
                    new GetPropValInstr(
                        context.globalObj,
                        ConstValue.getConst(symName)
                    )
                );
            }

            // Otherwise, if this variable is a shared closure variable
            else if (varContext.sharedMap.hasItem(symName))
            {
                // Get the mutable cell for the variable
                var cellValue = context.sharedMap.getItem(symName);

                // Get the value in the mutable cell
                lhsVal = varContext.addInstr(
                    new GetCellInstr(cellValue)
                );   
            }

            // Otherwise, the variable is local
            else
            {
                // Get the value in the local map
                lhsVal = varContext.localMap.getItem(symName, rhsVal);
            }

            // Update the RHS value according to the specified function
            var funcCtx = varContext.pursue(context.astNode);
            rhsVal(funcCtx, lhsVal);
            var rhsValAssg = funcCtx.getOutValue();

            // Create a new context to pursue the code generation
            varContext = funcCtx.pursue(funcCtx.astNode);
        }
        else
        {
            var rhsValAssg = rhsVal;
        }

        // If the variable is global
        if (leftExpr.id.scope instanceof Program)
        {
            // Get the value from the global object
            insertCallIR(
                varContext,
                new PutPropValInstr(
                    context.globalObj,
                    ConstValue.getConst(symName),
                    rhsValAssg
                )
            );
        }

        // Otherwise, if this variable is a shared closure variable
        else if (context.sharedMap.hasItem(symName))
        {
            // Get the mutable cell for the variable
            var cellValue = context.sharedMap.getItem(symName);

            // Set the value in the mutable cell
            varContext.addInstr(
                new PutCellInstr(cellValue, rhsValAssg)
            );   
        }

        // Otherwise, the variable is local
        else
        {
            // Update the variable value in the locals map
            varContext.localMap.setItem(symName, rhsValAssg);
        }

        // If we are within a with block
        if (context.withVal)
        {
            // If a RHS code gen function was specified
            if (rhsVal instanceof Function)
            {   
                // Declare a variable for the LHS value
                var lhsVal;

                // Get the value in the with object
                lhsVal = insertCallIR(
                    propContext,
                    new GetPropValInstr(
                        context.withVal,
                        ConstValue.getConst(symName)
                    )
                );

                // Update the RHS value according to the specified function
                var funcCtx = propContext.pursue(context.astNode);
                rhsVal(funcCtx, lhsVal);
                var rhsValAssg = funcCtx.getOutValue();

                // Create a new context to pursue the code generation
                propContext = funcCtx.pursue(funcCtx.astNode);
            }
            else
            {
                var rhsValAssg = rhsVal;
            }

            // Set the value in the with object
            insertCallIR(
                propContext,
                new PutPropValInstr(
                    context.withVal,
                    ConstValue.getConst(symName),
                    rhsValAssg
                )
            );

            // Bridge the prop and var contexts
            propContext.bridge();
            varContext.bridge();

            // Merge the local maps using phi nodes
            var joinBlock = mergeContexts(
                [propContext, varContext],
                context.localMap,
                context.cfg,
                'with_join'
            );

            // Create a new context for the join block
            var curContext = context.branch(
                context.astNode,
                joinBlock,
                context.localMap
            );
        }
        else
        {
            // Use the context from the variable case
            var curContext = varContext;
        }

        // If the assignment value is and instruction, but not a function argument
        if (rhsValAssg instanceof IRInstr && !(rhsValAssg instanceof ArgValInstr))
        {
            // If the value already has a name, release it
            if (rhsValAssg.outName)
                context.cfg.freeInstrName(rhsValAssg);

            // Assign the lhs variable name to the instruction
            context.cfg.assignInstrName(rhsValAssg, symName);
        }

        // The value of the right expression is the assignment expression's value
        context.setOutput(curContext.entryBlock, rhsValAssg);
    }

    // Otherwise, if the left-hand side is an object field
    else if (leftExpr instanceof OpExpr && leftExpr.op == 'x [ y ]')
    {
        var objExpr = leftExpr.exprs[0];
        var idxExpr = leftExpr.exprs[1];
    
        // Generate code for the object expression
        var objContext = context.pursue(objExpr);
        exprToIR(objContext);

        // Generate code for the index expression
        var idxContext = objContext.pursue(idxExpr);
        exprToIR(idxContext);

        // Create a new context to pursue the code generation
        var curContext = idxContext.pursue(context.astNode);

        // If a RHS code gen function was specified
        if (rhsVal instanceof Function)
        {
            // Declare a variable for the LHS value
            var lhsVal;

            // Get the property's current value
            lhsVal = insertCallIR(
                curContext,
                new GetPropValInstr(
                    objContext.getOutValue(),
                    idxContext.getOutValue()
                )
            ); 

            // Update the RHS value according to the specified function
            var funcCtx = curContext.pursue(context.astNode);
            rhsVal(funcCtx, lhsVal);
            rhsVal = funcCtx.getOutValue();

            // Create a new context to pursue the code generation
            curContext = funcCtx.pursue(funcCtx.astNode);
        }

        // Set the property to the right expression's value
        insertCallIR(
            curContext,
            new PutPropValInstr(
                objContext.getOutValue(),
                idxContext.getOutValue(),
                rhsVal
            )
        );

        // The value of the right expression is the assignment expression's value
        context.setOutput(curContext.entryBlock, rhsVal);
    }

    // Otherwise
    else
    {
        pp(leftExpr);
        assert (false, 'unsupported assignment lhs expression');
    }
}

/**
Convert a variable reference expression to IR code
*/
function refToIR(context)
{
    // Ensure that the IR conversion context is valid
    assert (
        context instanceof IRConvContext,
        'invalid IR conversion context specified'
    );

    var astExpr = context.astNode;

    var symName = astExpr.id.toString();

    // Declare variables for the variable value
    var varValueVar;
    var varValueProp;

    // If we are within a with block
    if (context.withVal)
    {
        // Add a has-property test on the object for the symbol name
        var hasTestVal = context.addInstr(
            new HasPropValInstr(
                context.withVal,
                ConstValue.getConst(symName)                
            )
        );

        // Context for the case where the with object has the property
        var propContext = context.branch(
            null,
            context.cfg.getNewBlock('with_prop'),
            context.localMap.copy()
        );

        // Context for the case where the object doesn't have the property
        var varContext = context.branch(
            null,
            context.cfg.getNewBlock('with_var'),
            context.localMap.copy()
        );

        // Add the if branch expression
        context.addInstr(
            new IfInstr(
                hasTestVal,
                propContext.entryBlock,
                varContext.entryBlock
            )
        );
    }
    else
    {
        var varContext = context;
    }

    // If the variable is global
    if (astExpr.id.scope instanceof Program && symName != 'arguments')
    {
        // Get the value from the global object
        varValueVar = insertCallIR(
            varContext,
            new GetPropValInstr(
                context.globalObj,
                ConstValue.getConst(symName)
            )
        );
    }

    // Otherwise, if this variable is a shared closure variable
    else if (context.sharedMap.hasItem(symName))
    {
        // Get the mutable cell for the variable
        var cellValue = context.sharedMap.getItem(symName);

        // Get the value from the mutable cell
        varValueVar = varContext.addInstr(
            new GetCellInstr(cellValue)
        );
    }

    // Otherwise, the variable is local
    else
    {
        assert (
            context.localMap.hasItem(symName), 
            'local variable not in locals map: ' + symName
        );

        // Lookup the variable in the locals map
        varValueVar = varContext.localMap.getItem(symName);
    }

    // If we are within a with block
    if (context.withVal)
    {
        // Get the value in the with object
        var varValueProp = insertCallIR(
            propContext,
            new GetPropValInstr(
                context.withVal,
                ConstValue.getConst(symName)
            )
        );

        // Bridge the prop and var contexts
        propContext.bridge();
        varContext.bridge();

        // Merge the local maps using phi nodes
        var joinBlock = mergeContexts(
            [propContext, varContext],
            context.localMap,
            context.cfg,
            'with_join'
        );

        // Create a phi node to merge the variable values
        var varValue = joinBlock.addInstr(
            new PhiInstr(
                [varValueVar, varValueProp],
                [varContext.getExitBlock(), propContext.getExitBlock()]
            )
        );

        // Create a new context for the join block
        var curContext = context.branch(
            context.astNode,
            joinBlock,
            context.localMap
        );
    }
    else
    {
        // Use the value and context from the variable case
        var curContext = varContext;
        var varValue = varValueVar;
    }

    // The variable value is the output value
    context.setOutput(curContext.entryBlock, varValue);
}

/**
Insert a call instruction in a given context, connect it with its continue 
and throw targets and produce a new context
*/
function insertCallIR(context, instr)
{
    // Create a basic block for the call continuation
    var contBlock = context.cfg.getNewBlock(instr.mnemonic + '_cont');

    // Set the continue target for the instruction
    instr.setContTarget(contBlock);

    // Add the call instruction to the current context
    var insBlock = 
        context.exitBlock? 
        context.getExitBlock():
        context.entryBlock
    ;
    insBlock.addInstr(instr);

    // If we are in a try block
    if (context.throwList)
    {
        // Create a new context and bridge it
        var newCtx = context.pursue(null);
        newCtx.bridge();

        // Add the new context to the list of throw contexts
        context.throwList.push(newCtx);
    }

    // Hijack the context to use the continue block
    if (context.exitBlock)
        context.exitBlock = contBlock;
    else
        context.entryBlock = contBlock;

    // Return the instruction value
    return instr;
}

/**
Generate a throw instruction with a given exception value
@param throwCtx context after which to throw the exception
@param excVal exception value to throw
*/
function throwToIR(context, throwCtx, excVal)
{
    // Add a throw instruction
    throwCtx.addInstr(
        new ThrowInstr(excVal)
    );

    // If this is an intraprocedural throw
    if (context.throwList)
    {
        // Add the context to the list of throw contexts
        context.throwList.push(throwCtx);
    }

    // Terminate the throw context, no instructions go after this
    context.terminate();
}

/**
Generate an exception throw with a given error class constructor
@param throwCtx context after which to throw the exception
@param excVal exception value to throw
*/
function errorToIR(context, throwCtx, errorCtor, errorMsg)
{
    // Create a block for the call continuation
    var contBlock = context.cfg.getNewBlock('exc_cont');

    // Create an error object exception
    var excVal = throwCtx.addInstr(
        new ConstructRefInstr(
            ConstValue.getConst(errorCtor),
            [ConstValue.getConst(errorMsg)],
            contBlock
        ),
        'excVal'
    );

    // Set the new context output to the call continuation block
    throwCtx.setOutput(contBlock);

    // Add a throw instruction
    throwCtx.addInstr(
        new ThrowInstr(excVal)
    );

    // If this is an intraprocedural throw
    if (context.throwList)
    {
        // Add the context to the list of throw contexts
        context.throwList.push(throwCtx);
    }

    // Terminate the throw context, no instructions go after this
    context.terminate();
}

/**
Merge IR conversion contexts local variables locations using phi nodes
*/
function mergeContexts(
    contexts,
    mergeMap,
    cfg,
    blockName
)
{
    // Build a list of non-terminated contexts
    var ntContexts = [];
    for (var i = 0; i < contexts.length; ++i)
        if (!contexts[i].isTerminated())
            ntContexts.push(contexts[i]);

    // Create a block for the merging
    var mergeBlock = cfg.getNewBlock(blockName);

    // If there are no non-terminated contexts, there is nothing to merge, stop
    if (ntContexts.length == 0)
        return mergeBlock;

    // Clear the contents of the merge map, if any
    mergeMap.clear();

    // Get the keys from the first join point
    var keys = ntContexts[0].localMap.getKeys();

    // For each local
    for (var i = 0; i < keys.length; ++i)
    {
        var varName = keys[i];

        // Create arrays for the incoming values and corresponding predecessors
        var values = [];
        var preds = [];

        // For each context
        for (var j = 0; j < ntContexts.length; ++j)
        {
            var context = ntContexts[j];

            // Add the value of the current variable to the list
            values.push(context.localMap.getItem(varName));
            preds.push(context.exitBlock);
        }

        // Compute properties of the input values
        var firstVal = values[0];
        var allEqual = true;
        var numUndef = 0;
        var numTyped = 0;
        for (var j = 0; j < values.length; ++j)
        {
            var value = values[j];
            if (value !== firstVal)
                allEqual = false;
            if (value instanceof ConstValue && value.isUndef())
                numUndef++;
            if (value.type !== IRType.BOXED)
                numTyped++;            
        }

        // If there is a mix of typed and undefined values
        if (numTyped > 0 && numUndef > 0 && numTyped + numUndef == values.length)
        {
            // Set the merge value to undefined
            mergeMap.addItem(varName, ConstValue.getConst(undefined));
        }

        // If not all incoming values are the same
        else if (!allEqual)
        {
            // Create a phi node for this variable
            var phiNode = new PhiInstr(values, preds);

            // Add the phi node to the merge block
            mergeBlock.addInstr(phiNode, varName);

            // Add the phi node to the merge map
            mergeMap.addItem(varName, phiNode);
        }

        // Otherwise, all values are the same
        else
        {
            // Add the value directly to the merge map
            mergeMap.addItem(varName, firstVal);
        }
    }

    // For each context
    for (var i = 0; i < ntContexts.length; ++i)
    {
        var context = ntContexts[i];

        // Make the block jump to the merge block
        if (!context.getExitBlock().hasBranch())
            context.addInstr(new JumpInstr(mergeBlock));
    }

    // Return the merge block
    return mergeBlock;
}

/**
Create an IR conversion context for a loop entry
*/
function createLoopEntry(
    loopStmt,
    entryNode,
    context,
    entryLocals,
    brkCtxList,
    cntCtxList,
    blockName
)
{
    // Get the label for this statement
    var label = loopStmt.stmtLabel? loopStmt.stmtLabel.toString():'';

    // Update the break and continue context maps for the loop body
    var breakMap = context.breakMap.copy();
    var contMap = context.contMap.copy();
    if (brkCtxList)
    {
        breakMap.setItem(label, brkCtxList);
        breakMap.setItem('', brkCtxList);
    }
    if (cntCtxList)
    {
        contMap.setItem(label, cntCtxList);
        contMap.setItem('', cntCtxList);
    }

    // Create a basic block for the loop entry
    var loopEntry = context.cfg.getNewBlock(blockName);

    // Create a phi node for each local variable in the current context
    var localVars = context.localMap.getKeys();
    for (var i = 0; i < localVars.length; ++i)
    {
        var varName = localVars[i];
        var phiNode = new PhiInstr(
            [context.localMap.getItem(varName)],
            [context.entryBlock]
        );
        loopEntry.addInstr(phiNode, varName);
        entryLocals.setItem(varName, phiNode);
    }

    // Return the loop entry context
    return new IRConvContext(
        entryNode,
        loopEntry,
        context.withVal,
        entryLocals.copy(),
        context.sharedMap,
        breakMap,
        contMap,
        context.throwList,
        context.cfg,
        context.funcObj,
        context.thisVal,
        context.globalObj
    );
}

/**
Merge contexts for a loop entry block
*/
function mergeLoopEntry(
    contexts,
    entryLocals,
    entryBlock
)
{
    // Get the local variable names
    var localVars = entryLocals.getKeys();

    // For each local variable
    for (var i = 0; i < localVars.length; ++i)
    {
        var varName = localVars[i];
        var phiNode = entryLocals.getItem(varName);

        // Compute properties of the current incoming values
        var numUndef = 0;
        var numTyped = 0;
        for (var j = 0; j < phiNode.uses.length; ++j)
        {
            var useValue = phiNode.uses[j];
            if (useValue instanceof ConstValue && useValue.isUndef())
                numUndef++;
            if (phiNode.uses[j].type != IRType.BOXED)
                numTyped++;
        }

        // For each incoming context
        for (var j = 0; j < contexts.length; ++j)
        {
            var context = contexts[j];
            var varValue = context.localMap.getItem(varName);

            if (varValue instanceof ConstValue && varValue.isUndef())
                numUndef++;
            if (varValue.type != IRType.BOXED)
                numTyped++;

            // If there would be a mix of typed and undefined values
            if (numTyped > 0 && numUndef > 0 && numTyped + numUndef == phiNode.uses.length + 1)
            {
                // Replace the phi node by the undefined value
                entryLocals.setItem(varName, ConstValue.getConst(undefined));

                // Abort the merge for this variable
                break;
            }

            // Add an incoming value for this context
            phiNode.addIncoming(varValue, context.getExitBlock());
        }
    }

    // Add a branch from every continue context to the loop entry
    for (var j = 0; j < contexts.length; ++j)
    {
        var context = contexts[j];

        var exitBlock = context.getExitBlock();

        if (!exitBlock.hasBranch())
            exitBlock.addInstr(new JumpInstr(entryBlock));
    }
}

/**
Test if a call expression is an inline IR instruction
*/
function isInlineIR(callExpr)
{
    var fnExpr = callExpr.fn;

    return (
        fnExpr instanceof OpExpr && 
        fnExpr.op == 'x [ y ]' &&
        fnExpr.exprs[0] instanceof Ref && 
        fnExpr.exprs[0].id.toString() == 'iir'
    );
}

/**
Generate an inline IR instruction
*/
function genInlineIR(context, branches)
{
    // Ensure that a valid expression was passed
    assert (
        context.astNode instanceof CallExpr && isInlineIR(context.astNode),
        'invalid inline IR expression'
    );

    // Get a reference to the function expression
    var fnExpr = context.astNode.fn;

    // Get a the call arguments
    var args = context.astNode.args.slice(0);

    // Create a list for the instruction arguments
    var instrArgs = [];

    // If the first argument is an IR type
    if (
        args.length > 0 && 
        args[0] instanceof OpExpr &&
        args[0].op == 'x [ y ]' &&
        args[0].exprs[0] instanceof Ref &&
        args[0].exprs[0].id.toString() == 'IRType'
    )
    {
        // Get a reference to the IR type object
        var typeName = args[0].exprs[1].value;
        var typeObj = IRType[typeName];

        // Remove the first argument from the list
        args.shift();

        // Add the type object to the instruction arguments
        instrArgs.push(typeObj);
    }

    // Compile the function argument list
    var argsContext = context.pursue(args);
    var argVals = exprListToIR(argsContext);
    instrArgs = instrArgs.concat(argVals);

    // If branch targets were specified, add them to the instruction arguments
    if (branches)
        instrArgs = instrArgs.concat(branches);

    // Get a reference to the instruction constructor
    var instrName = fnExpr.exprs[1].value;
    var instrCtor = iir[instrName];

    // Create the new instruction
    var newInstr = new instrCtor(instrArgs);

    // Add the new instruction to the current basic block
    argsContext.addInstr(newInstr);

    // Set the new instruction as the output
    context.setOutput(argsContext.getExitBlock(), newInstr);
}

/**
Test if an if statement is a conditional inline IR instruction
*/
function isCondInlineIR(ifStmt)
{
    return (
        isInlineIR(ifStmt.expr) 
        ||
        (
            ifStmt.expr instanceof OpExpr &&
            ifStmt.expr.op == 'x = y' &&
            ifStmt.expr.exprs[0] instanceof Ref &&
            isInlineIR(ifStmt.expr.exprs[1])
        )
    );
}

/**
Generate a conditional inline IR instruction
*/
function genCondInlineIR(context)
{
    // Ensure that a valid statement was passed
    assert (
        context.astNode instanceof IfStatement && isCondInlineIR(context.astNode),
        'invalid conditional inline IR expression'
    );

    // Get a reference to the if statement
    var astStmt = context.astNode;

    // Create basic blocks for the true and false branches
    var trueBlock = context.cfg.getNewBlock('iir_true');
    var falseBlock = context.cfg.getNewBlock('iir_false');

    // If this is an inline IR instruction with value assignment
    if (
        astStmt.expr instanceof OpExpr &&
        astStmt.expr.op == 'x = y' &&
        astStmt.expr.exprs[0] instanceof Ref &&
        isInlineIR(astStmt.expr.exprs[1])
    )
    {
        // Compile the inline IR instruction
        var testContext = context.pursue(astStmt.expr.exprs[1]);
        genInlineIR(testContext, [trueBlock, falseBlock]);

        // Store the IIR instruction output value
        var iirValue = testContext.getOutValue();

        // Create a context for the true assignment
        var trueAssgCtx = context.branch(
            astStmt.expr.exprs[0],
            trueBlock,
            testContext.localMap.copy()
        );

        // Create a context for the false assignment
        var falseAssgCtx = context.branch(
            astStmt.expr.exprs[0],
            falseBlock,
            testContext.localMap.copy()
        );

        // Assign the value on both branches
        assgToIR(trueAssgCtx, iirValue);
        assgToIR(falseAssgCtx, iirValue);

        // Pursue the assignment context for the true statement
        var trueContext = trueAssgCtx.pursue(
            astStmt.statements[0]
        );

        // Pursue the assignment context for the false statement
        var falseContext = falseAssgCtx.pursue(
            astStmt.statements[1]? astStmt.statements[1]:null
        );
    }
    else
    {
        // Compile the inline IR instruction
        var testContext = context.pursue(astStmt.expr);
        genInlineIR(testContext, [trueBlock, falseBlock]);

        // Create a context for the true statement
        var trueContext = context.branch(
            astStmt.statements[0],
            trueBlock,
            testContext.localMap.copy()
        );

        // Create a context for the false statement
        var falseContext = context.branch(
            astStmt.statements[1]? astStmt.statements[1]:null,
            falseBlock,
            testContext.localMap.copy()
        );
    }

    // Compile the true statement
    stmtToIR(trueContext);

    // Compile the false statement, if it is defined
    if (astStmt.statements.length > 1)
        stmtToIR(falseContext);
    else
        falseContext.bridge();

    // Merge the local maps using phi nodes
    var joinBlock = mergeContexts(
        [trueContext, falseContext],
        context.localMap,
        context.cfg,
        'iir_join'
    );

    // Set the exit block to be the join block
    context.setOutput(joinBlock);
}


printTachyonState();

print("Running after initialization of boostrap code");
print("x86: " + x86);
print("asm: " + asm);
print("IRType: " + IRType);
print("IRType.box: " + IRType.box);

print('Initializing Tachyon');

// Initialize Tachyon in minimal mode
initialize(false);

printTachyonState();

print("Fib: compiling source code to a code block");
var fibIR = compileSrcString("function fib(n) { if (n < 2) { return n; } else { return fib(n-1) + fib(n-2); } }", config.hostParams);
var fibCB = backend.compileIRToCB(fibIR, config.hostParams); 

print("Fib listing:");
print(backend.listing(fibCB));

print("Fib: compiling source code to a machine code block");
var bridge = makeBridge(
    fibIR,
    config.hostParams,
    [new CIntAsBox()],
    new CIntAsBox()
);

bridge(config.hostParams.ctxPtr);


/*
try
{
    // Initialize Tachyon in minimal mode
    initConfig();

    params = config.hostParams;

    // Create the context and object layouts
    params.target.backendCfg.makeContextLayout(params);
    makeContextLayout(params);
    makeObjectLayouts(params);

    // Get the source code for the primitives
    var primSrcs = getPrimSrcs(params);
    print(primSrcs);

    // Compile the primitives
    var primIRs = compSources(primSrcs, params, true);


    print("Running in bootstrap mode");
    print(IRType);

    print("compiling fib source code to a code block");
    var fibIR = compileSrcString("function fib(n) { if (n < 2) { return n; } else { return fib(n-1) + fib(n-2); } }", config.hostParams);
    var fibCB = backend.compileIRToCB(fibIR, config.hostParams); 
    print(backend.listing(fibCB));
} catch (e)
{
    if (e.stack)
        print(e.stack);
    else
        print(e);
}*/


// Initialize Tachyon in minimal mode
//initialize(false);

// Call the Tachyon read-eval-print loop
//tachyonRepl();


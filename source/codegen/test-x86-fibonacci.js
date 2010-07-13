var a = new x86_Assembler();
const reg = a.register;
const ESP = reg.esp;
const EAX = reg.eax;
const EBX = reg.ebx;
const $   = a.immediateValue;
const mem = a.memory;
const _   = function (reg) { return mem(0,reg); };
const _12   = function (reg) { return mem(12,reg); };
const _16   = function (reg) { return mem(16,reg); };

var FIB       = a.codeBlock.label("FIB");
var BASE_CASE = a.codeBlock.label("BASE_CASE");
var RECURSION = a.codeBlock.label("RECURSION");

a.codeBlock.bigEndian = false;

a.
movl($(40), EAX).

label(FIB).
    cmpl($(2), EAX).
    jge(RECURSION).

label(BASE_CASE).
    ret().

label(RECURSION).
    push(EAX).
    addl($(-1), EAX).
    call(FIB).

    movl(EAX, EBX).
    pop(EAX).
    push(EBX).
    addl($(-2), EAX).
    call(FIB).

    pop(EBX).
    addl(EBX, EAX).
    ret     ();

a.codeBlock.assemble();

print(a.codeBlock.listingString());

var block = a.codeBlock.assembleToMachineCodeBlock(); // assemble it
print(execMachineCodeBlock(block)); // execute the code generated
freeMachineCodeBlock(block);

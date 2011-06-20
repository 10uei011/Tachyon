function testx86Enc()
{
    // Test encodings for 32-bit and 64-bit
    function test(codeFunc, enc32, enc64)
    {
        // Test either a 32-bit or 64-bit encoding
        function testEnc(enc, x86_64)
        {
            // Report an encoding error
            function encError()
            {
                error(
                    'invalid ' + (x86_64? 64:32) + '-bit encoding for:\n' +
                    assembler.toString() + '\n' +
                    '\n' +
                    'produced:\n' +
                    codeBlock.toString() + ' (' + codeBlock.size + ' bytes)\n' +
                    'expected:\n' +
                    encBlock.toString() + ' (' + encBlock.size + ' bytes)'
                );
            }

            assert (
                typeof enc === 'string',
                'encoding must be provided as a hex string'
            );

            assert (
                enc.length % 2 == 0,
                'encoding string should have multiple of 2 length'
            );

            // Compute the number of bytes in the encoding
            var numBytes = enc.length / 2;

            // Create a code block to write the encoding into
            var encBlock = new CodeBlock(numBytes);

            // For each encoding byte
            for (var i = 0; i < numBytes; ++i)
            {
                var num = parseInt(enc.substr(2*i, 2), 16);

                assert (
                    typeof num === 'number',
                    'invalid encoding string: "' + enc + '"'
                );

                // Write the byte into the code block
                encBlock.writeByte(num);
            }

            // Create an assembler to write code into
            var assembler = new x86.Assembler(x86_64);

            // Produce the assembly
            codeFunc(assembler);

            // Assemble the code to a machine code block
            var codeBlock = assembler.assemble();

            // Check that the encoding length matches
            if (codeBlock.size !== encBlock.size)
                encError();

            // Compare all bytes in the block
            for (var i = 0; i < codeBlock.size; ++i)
            {
                if (codeBlock.readByte(i) !== encBlock.readByte(i))
                    encError();
            }
        }

        assert (
            !(enc64 === false && (enc32 === false || enc32 === undefined)),
            'no 32-bit or 64-bit encoding available for testing'
        );

        // Test the available 32-bit or 64-bit encodings
        if (enc32 !== false)
            testEnc(enc32, false);
        if (enc64 === undefined)
            testEnc(enc32, true);
        if (enc64 !== undefined && enc64 !== false)
            testEnc(enc64, true);
    }

    // add
    test(
        function (a) { a.add(a.al, 3); },
        '0403'
    );
    test(
        function (a) { a.add(a.cl, a.bl); },
        '00D9'
    );
    test(
        function (a) { a.add(a.cl, a.dh); },
        '00F1'
    );
    test(
        function (a) { a.add(a.cl, a.spl); },
        false,
        '4000E1'
    );
    test(
        function (a) { a.add(a.cx, a.bx); },
        '6601D9'
    );
    test(
        function (a) { a.add(a.rdx, a.r14); },
        false,
        '4C01F2'
    );
    test(
        function (a) { a.add(a.edx, a.mem(32, a.eax)); },
        '0310',
        '670310'
    );
    test(
        function (a) { a.add(a.mem(32, a.eax), a.edx); },
        '0110',
        '670110'
    );
    test(
        function (a) { a.add(a.mem(64, a.rax), a.rdx); },
        false, 
        '480110'
    );
    test(
        function (a) { a.add(a.mem(32, a.rax), a.edx); }, 
        false, 
        '0110'
    );

    // and
    test(
        function (a) { a.and(a.ebp, a.r12d); }, 
        false, 
        '4421E5'
    );

    // cmp
    test(
        function (a) { a.cmp(a.ecx, a.edi); },
        '39F9'
    );   
    test(
        function (a) { a.cmp(a.rdx, a.mem(64, a.r12)); },
        false,
        '493B1424'
    );   

    // cpuid
    test(
        function (a) { a.cpuid(); }, 
        '0FA2'
    );    

    // imul
    test(
        function (a) { a.imul(a.edx, a.ecx); },
        '0FAFD1'
    );
    test(
        function (a) { a.imul(a.rsi, a.rdi); },
        false,
        '480FAFF7'
    );
    test(
        function (a) { a.imul(a.r14, a.r9); }, 
        false, 
        '4D0FAFF1'
    );

    // mov
    test(
        function (a) { a.mov(a.eax, 7); }, 
        'B807000000'
    );
    test(
        function (a) { a.mov(a.eax, -3); }, 
        'B8FDFFFFFF'
    );
    test(
        function (a) { a.mov(a.eax, a.ebx); }, 
        '89D8'
    );

    // mul
    test(
        function (a) { a.mul(a.edx); }, 
        'F7E2'
    );
    test(
        function (a) { a.mul(a.r15); },
        false,
        '49F7E7'
    );
    test(
        function (a) { a.mul(a.r10d); },
        false,
        '41F7E2'
    );

    // nop
    test(
        function (a) { a.nop(); }, 
        '90'
    );

    // not
    test(
        function (a) { a.not(a.ax); }, 
        '66F7D0'
    );
    test(
        function (a) { a.not(a.eax); }, 
        'F7D0'
    );
    test(
        function (a) { a.not(a.rax); }, false, 
        '48F7D0'
    );
    test(
        function (a) { a.not(a.r11); }, 
        false, 
        '49F7D3'
    );
    test(
        function (a) { a.not(a.mem(32, a.eax)); }, 
        'F710', 
        '67F710'
    );
    test(
        function (a) { a.not(a.mem(32, a.esi)); },
        'F716', 
        '67F716'
    );
    test(
        function (a) { a.not(a.mem(32, a.edi)); }, 
        'F717', 
        '67F717'
    );
    test(
        function (a) { a.not(a.mem(32, a.edx, 55)); },
        'F75237', 
        '67F75237'
    );
    test(
        function (a) { a.not(a.mem(32, a.edx, 1337)); },
        'F79239050000', 
        '67F79239050000'
    );
    test(
        function (a) { a.not(a.mem(32, a.edx, -55)); },
        'F752C9', 
        '67F752C9'
    );
    test(
        function (a) { a.not(a.mem(32, a.edx, -555)); },
        'F792D5FDFFFF', 
        '67F792D5FDFFFF'
    );
    test(
        function (a) { a.not(a.mem(32, a.eax, 0, a.ebx)); }, 
        'F71418', 
        '67F71418'
    );
    test(
        function (a) { a.not(a.mem(32, a.rax, 0, a.rbx)); }, 
        false, 
        'F71418'
    );
    test(
        function (a) { a.not(a.mem(32, a.rax, 0, a.r12)); }, 
        false, 
        '42F71420'
    );
    test(
        function (a) { a.not(a.mem(32, a.r15, 0, a.r12)); }, 
        false, 
        '43F71427'
    );
    test(
        function (a) { a.not(a.mem(32, a.r15, 5, a.r12)); }, 
        false, 
        '43F7542705'
    );
    test(
        function (a) { a.not(a.mem(32, a.r15, 5, a.r12, 8)); }, 
        false, 
        '43F754E705'
    );
    test(
        function (a) { a.not(a.mem(32, a.r15, 5, a.r13, 8)); }, 
        false, 
        '43F754EF05'
    );
    test(
        function (a) { a.not(a.mem(64, a.r12)); }, 
        false,
        '49F71424'
    );
    test(
        function (a) { a.not(a.mem(32, a.r12, 5, a.r9, 4)); }, 
        false, 
        '43F7548C05'
    );
    test(
        function (a) { a.not(a.mem(32, a.r12, 301, a.r9, 4)); }, 
        false, 
        '43F7948C2D010000'
    );
    test(
        function (a) { a.not(a.mem(32, a.eax, 5, a.edx, 4)); }, 
        'F7549005',
        '67F7549005'
    );
    test(
        function (a) { a.not(a.mem(64, a.eax, 0, a.edx, 2)); },
        false,
        '6748F71450'
    );
    test(
        function (a) { a.not(a.mem(32, a.esp)); },
        'F71424',
        '67F71424'
    );
    test(
        function (a) { a.not(a.mem(32, a.esp, 301)); }, 
        'F794242D010000',
        '67F794242D010000'
    );
    test(
        function (a) { a.not(a.mem(32, a.rsp)); },
        false,
        'F71424'
    );
    test(
        function (a) { a.not(a.mem(32, a.rsp, 0, a.rbx)); },
        false,
        'F7141C'
    );
    test(
        function (a) { a.not(a.mem(32, a.rsp, 3, a.rbx)); },
        false,
        'F7541C03'
    );
    test(
        function (a) { a.not(a.mem(32, a.rsp, 3)); },
        false,
        'F7542403'
    );
    test(
        function (a) { a.not(a.mem(32, a.ebp)); },
        'F75500',
        '67F75500'
    );
    test(
        function (a) { a.not(a.mem(32, a.ebp, 13)); },
        'F7550D',
        '67F7550D'
    );
    test(
        function (a) { a.not(a.mem(32, a.ebp, 13, a.edx)); },
        'F754150D',
        '67F754150D'
    );
    test(
        function (a) { a.not(a.mem(32, a.rip)); },
        false,
        'F79500000000'
    );
    test(
        function (a) { a.not(a.mem(32, a.rip, 13)); },
        false,
        'F7950D000000'
    );
    test(function (a) { a.not(a.mem(32, undefined, 0, a.r8, 8)); }, 
        false, 
        '42F714C500000000'
    );
    test(function (a) { a.not(a.mem(32, undefined, 5)); }, 
        'F71505000000', 
        'F7142505000000'
    );

    // or
    test(
        function (a) { a.or(a.edx, a.esi); },
        '09F2'
    );

    // pop
    test(
        function (a) { a.pop(a.eax); }, 
        '58',
        false
    );
    test(
        function (a) { a.pop(a.ebx); },
        '5B',
        false
    );

    // push
    test(
        function (a) { a.push(a.eax); },
        '50',
        false
    );
    test(
        function (a) { a.push(a.bx); }, 
        '6653', 
        false
    );
    test(
        function (a) { a.push(a.ebx); },
        '53',
        false
    );
    test(
        function (a) { a.push(1); },
        '6A01',
        false
    );

    // ret
    test(
        function (a) { a.ret(); },
        'C3'
    );
    test(
        function (a) { a.ret(5); },
        'C20500'
    );

    // xchg
    test(
        function (a) { a.xchg(a.ax, a.dx); }, 
        '6692'
    );
    test(
        function (a) { a.xchg(a.eax, a.edx); }, 
        '92'
    );
    test(
        function (a) { a.xchg(a.rax, a.r15); },
        false,
        '4997'
    );
    test(
        function (a) { a.xchg(a.r14, a.r15); }, 
        false, 
        '4D87FE'
    );

    // xor
    test(
        function (a) { a.xor(a.eax, a.eax); },
        false, 
        '31C0'
    );
}









try
{
    testx86Enc();

    var assembler = new x86.Assembler(false);

    with (assembler)
    {

        mov(eax, 0);
        var LOOP = label('LOOP');
        add(eax, 1);
        cmp(eax, 10);
        jb(LOOP);

    }

    print('');
    print('assembly: ');
    print('');
    print(assembler.toString(true));

    // Assemble to a code block
    var codeBlock = assembler.assemble();

    print('');
    print('code block: ');
    print(codeBlock.size + ' bytes');
    print(codeBlock);
}

catch (e)
{
    if (e.stack)
        print(e.stack);
}

/*
TODO: call, with callTachyonFFI?
var ret = callTachyonFFI(
    ['void*', 'int'],
    'void*',
    funcPtr, 
    ctxPtr,
    [heapAddr, heapSize]
);
*/




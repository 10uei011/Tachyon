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

function foo()
{
    return 1;
}

function foo1(x)
{
    return x;
}

function foo2(x,y)
{
    return x+y;
}

function foo3(x,y,z)
{
    return x+y+z;
}

function foo4(x)
{
    if (x)
    {
        return false;
    }
    else
    {
        return true;
    }
}

function foo5(x,y)
{
    if (x !== 1 || y)
    {
        return false;
    } 
    else
    {
        return true;
    }
}

function foo6(x,y,z)
{
    if (x !== 1 || y !== 2 || z)
    {
        return false;
    }

    return true; 
}

function foo7(x1,x2,x3,x4,x5,x6,x7,x8,x9)
{
    if (x1 || x2 || x3 || x4 || x5 || x6 || x7 || x8 || x9)
    {
        return false;
    }

    return true;
}

function argCnt8(a1, a2, a3, a4, a5, a6, a7, a8)
{
    var cnt = 0;

    if (a1) cnt += 1;
    if (a2) cnt += 1;
    if (a3) cnt += 1;
    if (a4) cnt += 1;
    if (a5) cnt += 1;
    if (a6) cnt += 1;
    if (a7) cnt += 1;
    if (a8) cnt += 1;

    return cnt;
}

function foo_proxy()
{
    // Pass more arguments than expected
    if (foo(1) !== 1)
        return 100;
    if (foo(1,2) !== 1)
        return 200;
    if (foo(1,2,3) !== 1)
        return 300;
    if (foo(0,1,2,3,4,5,6) !== 1)
        return 400;

    if (foo1(0,1,2,3,4,5,6) !== 0)
        return 500;

    if (foo2(0,1,2,3,4,5,6) !== 1)
        return 600;

    if (foo3(0,1,2) !== 3)
        return 700;

    var r = foo3(0,1,2,3,4,5,6);
    if (r !== 3)
        return 800 + r;

    // Pass less arguments than expected
    if (!foo4())
        return 900;

    if (!foo5(1))
        return 1000;

    if (!foo6(1,2))
        return 1100;

    if (!foo7())
        return 1200;

    // Argument counting
    if (argCnt8() !== 0)
        return 1300;
    if (argCnt8(7) !== 1)
        return 1400;
    if (argCnt8(7,7) !== 2)
        return 1500;
    if (argCnt8(7,7,7) !== 3)
        return 1600;
    if (argCnt8(7,7,7,7) !== 4)
        return 1700;
    if (argCnt8(7,7,7,7,7) !== 5)
        return 1800;
    if (argCnt8(7,7,7,7,7,7) !== 6)
        return 1900;
    if (argCnt8(7,7,7,7,7,7,7) !== 7)
        return 2000;
    if (argCnt8(7,7,7,7,7,7,7,7) !== 8)
        return 2100;
    if (argCnt8(7,7,7,7,7,7,7,7,7) !== 8)
        return 2200;

    return 0;
}


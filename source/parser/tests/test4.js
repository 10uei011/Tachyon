function f(x)
{
    // TODO: x++, ++x
    //++x;

    //a = { x: 1, y:'foo', z: (x+1) };
    //this.foo = a;
    //a = x? y:z;
    //a = x && y;
    a = x || y;

    /*
    for (var i = 0; i < 10; i = i + 1)
    {
        if (true)
            continue;

    }

    print(i);
    */

    /*
    var y;

    if (true)
        y = 1;
    else
        y = 1;
    
    f(y);
    */
    
    /*
    var y = 0;

    do
    {
        if (true)
        {
            y = 1;
            break;
        }

        y = y + 1;

    } while (true);

    f(y);
    */


    /*
    var y = 0;

    while (true)
    {
        if (true)
        {
            y = 3;
            break;
        }

        y = y + 1;
    }    

    f(y);
    */


    //y[0] = x + 1;

    /*
    var y = 0;

    if (true)
        y = 0;

    f(y);
    */

    /*    
    foo:
    while (true)
    {
        y = y + 1;

        f(y);

        if (true)
            continue;
        else
            y = 3;
    }
    */

    /*
    if (x < 2)
        return 1;
    else
        return f(x-1) + f(x-2);
    */

    /*
    if (x && y)
    {
    }
    */

    //x.foo(5);

    /*
    function foo()
    {
    }

    print('hi');
    */
}

print(f(20));


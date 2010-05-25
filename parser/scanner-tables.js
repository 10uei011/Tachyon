var EOI_CAT = 0;
var error_CAT = 1;
var NULL_CAT = 2;
var TRUE_CAT = 3;
var FALSE_CAT = 4;
var BREAK_CAT = 5;
var CASE_CAT = 6;
var DEFAULT_CAT = 7;
var FOR_CAT = 8;
var NEW_CAT = 9;
var VAR_CAT = 10;
var CONST_CAT = 11;
var CONTINUE_CAT = 12;
var FUNCTION_CAT = 13;
var RETURN_CAT = 14;
var VOID_CAT = 15;
var DELETE_CAT = 16;
var IF_CAT = 17;
var THIS_CAT = 18;
var DO_CAT = 19;
var WHILE_CAT = 20;
var IN_CAT = 21;
var INSTANCEOF_CAT = 22;
var TYPEOF_CAT = 23;
var SWITCH_CAT = 24;
var WITH_CAT = 25;
var RESERVED_CAT = 26;
var THROW_CAT = 27;
var TRY_CAT = 28;
var CATCH_CAT = 29;
var FINALLY_CAT = 30;
var DEBUGGER_CAT = 31;
var EQEQ_CAT = 32;
var NE_CAT = 33;
var STREQ_CAT = 34;
var STRNEQ_CAT = 35;
var LE_CAT = 36;
var GE_CAT = 37;
var OR_CAT = 38;
var AND_CAT = 39;
var PLUSPLUS_CAT = 40;
var MINUSMINUS_CAT = 41;
var LSHIFT_CAT = 42;
var RSHIFT_CAT = 43;
var URSHIFT_CAT = 44;
var PLUSEQUAL_CAT = 45;
var MINUSEQUAL_CAT = 46;
var MULTEQUAL_CAT = 47;
var DIVEQUAL_CAT = 48;
var LSHIFTEQUAL_CAT = 49;
var RSHIFTEQUAL_CAT = 50;
var URSHIFTEQUAL_CAT = 51;
var ANDEQUAL_CAT = 52;
var MODEQUAL_CAT = 53;
var XOREQUAL_CAT = 54;
var OREQUAL_CAT = 55;
var LBRACE_CAT = 56;
var RBRACE_CAT = 57;
var NUMBER_CAT = 58;
var IDENT_CAT = 59;
var STRING_CAT = 60;
var AUTOPLUSPLUS_CAT = 61;
var AUTOMINUSMINUS_CAT = 62;
var CLASS_CAT = 63;
var ENUM_CAT = 64;
var EXPORT_CAT = 65;
var EXTENDS_CAT = 66;
var IMPORT_CAT = 67;
var SUPER_CAT = 68;
var IMPLEMENTS_CAT = 69;
var INTERFACE_CAT = 70;
var LET_CAT = 71;
var PACKAGE_CAT = 72;
var PRIVATE_CAT = 73;
var PROTECTED_CAT = 74;
var PUBLIC_CAT = 75;
var STATIC_CAT = 76;
var YIELD_CAT = 77;
var PLUS_CAT = 78;
var LPAREN_CAT = 79;
var EQUAL_CAT = 80;
var LT_CAT = 81;
var COLON_CAT = 82;
var VBAR_CAT = 83;
var EXCL_CAT = 84;
var LBRACK_CAT = 85;
var RBRACK_CAT = 86;
var DIV_CAT = 87;
var MINUS_CAT = 88;
var COMMA_CAT = 89;
var MULT_CAT = 90;
var RPAREN_CAT = 91;
var GT_CAT = 92;
var BITAND_CAT = 93;
var BITNOT_CAT = 94;
var QUESTION_CAT = 95;
var SEMICOLON_CAT = 96;
var BITXOR_CAT = 97;
var MOD_CAT = 98;
var PERIOD_CAT = 99;
var FOOBAR_CAT = 100;
var ELSE_CAT = 101;
var IF_WITHOUT_ELSE_CAT = 102;

var HASH_MOD = 147;
var HASH_MULT = 17;

var keyword_hashtable =
[
 { id: "const", cat: CONST_CAT }
,{ id: "continue", cat: CONTINUE_CAT }
,false
,false
,false
,false
,false
,false
,false
,{ id: "try", cat: TRY_CAT }
,false
,false
,false
,false
,{ id: "finally", cat: FINALLY_CAT }
,false
,false
,false
,false
,{ id: "enum", cat: ENUM_CAT }
,false
,{ id: "for", cat: FOR_CAT }
,false
,false
,{ id: "debugger", cat: DEBUGGER_CAT }
,{ id: "class", cat: CLASS_CAT }
,false
,{ id: "public", cat: PUBLIC_CAT }
,false
,false
,false
,false
,{ id: "switch", cat: SWITCH_CAT }
,false
,false
,false
,false
,false
,{ id: "break", cat: BREAK_CAT }
,{ id: "true", cat: TRUE_CAT }
,false
,false
,{ id: "typeof", cat: TYPEOF_CAT }
,false
,false
,false
,{ id: "this", cat: THIS_CAT }
,{ id: "do", cat: DO_CAT }
,false
,false
,false
,false
,false
,{ id: "throw", cat: THROW_CAT }
,false
,false
,false
,false
,false
,false
,false
,false
,false
,false
,{ id: "implements", cat: IMPLEMENTS_CAT }
,{ id: "case", cat: CASE_CAT }
,false
,false
,false
,{ id: "package", cat: PACKAGE_CAT }
,false
,false
,false
,false
,false
,{ id: "delete", cat: DELETE_CAT }
,false
,false
,{ id: "default", cat: DEFAULT_CAT }
,false
,{ id: "import", cat: IMPORT_CAT }
,{ id: "super", cat: SUPER_CAT }
,false
,{ id: "protected", cat: PROTECTED_CAT }
,{ id: "false", cat: FALSE_CAT }
,false
,false
,false
,{ id: "yield", cat: YIELD_CAT }
,false
,false
,false
,false
,false
,{ id: "null", cat: NULL_CAT }
,{ id: "return", cat: RETURN_CAT }
,false
,false
,false
,false
,false
,false
,false
,false
,{ id: "while", cat: WHILE_CAT }
,false
,false
,false
,false
,{ id: "with", cat: WITH_CAT }
,{ id: "new", cat: NEW_CAT }
,false
,false
,false
,false
,{ id: "private", cat: PRIVATE_CAT }
,false
,{ id: "let", cat: LET_CAT }
,false
,false
,{ id: "void", cat: VOID_CAT }
,{ id: "function", cat: FUNCTION_CAT }
,false
,{ id: "if", cat: IF_CAT }
,false
,{ id: "export", cat: EXPORT_CAT }
,false
,false
,false
,false
,false
,{ id: "in", cat: IN_CAT }
,false
,{ id: "interface", cat: INTERFACE_CAT }
,{ id: "else", cat: ELSE_CAT }
,{ id: "instanceof", cat: INSTANCEOF_CAT }
,false
,false
,false
,false
,false
,{ id: "catch", cat: CATCH_CAT }
,false
,false
,{ id: "var", cat: VAR_CAT }
,{ id: "extends", cat: EXTENDS_CAT }
,{ id: "static", cat: STATIC_CAT }
];

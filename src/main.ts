import { fromCharCode, toCharCode } from "./lib";

import { isalnum, isalpha, isdigit, isspace} from "./cctype";
import { EOF, getchar } from "./cstdio";

//===----------------------------------------------------------------------===//
// Lexer
//===----------------------------------------------------------------------===//

// The lexer returns tokens [0-255] if it is an unknown character, otherwise one
// of these for known things.
enum Token {
    tok_eof = -1,

    // commands
    tok_def = -2,
    tok_extern = -3,

    // primary
    tok_identifier = -4,
    tok_number = -5,
}

let IdentifierStr:string; // Filled in if tok_identifier
let NumVal:number;        // Filled in if tok_number

/// gettok - Return the next token from standard input.
let LastChar:number = toCharCode(' ');
async function gettok () : Promise<number> {
    // Skip any whitespace.
    while (isspace(LastChar)) {
        LastChar = await getchar();
    }

    if (isalpha(LastChar)) { // identifier: [a-zA-Z][a-zA-Z0-9]*
        IdentifierStr = fromCharCode(LastChar);
        while (isalnum((LastChar = await getchar()))) {
            IdentifierStr += fromCharCode(LastChar);
        }

        if (IdentifierStr === "def") {
            return Token.tok_def;
        }
        if (IdentifierStr === "extern") {
            return Token.tok_extern;
        }
        return Token.tok_identifier;
    }

    if ( isdigit(LastChar) || LastChar === toCharCode('.') ) { // Number: [0-9.]+
        let NumStr:string = '';
        do {
            NumStr += fromCharCode(LastChar);
            LastChar = await getchar();
        } while ( isdigit(LastChar) || LastChar === toCharCode('.') );

        NumVal = parseFloat(NumStr);
        return Token.tok_number;
    }

    if ( LastChar === toCharCode('#') ) {
        // Comment until end of line.
        do {
            LastChar = await getchar();
        } while ( LastChar !== EOF && LastChar !== toCharCode('\n') && LastChar !== toCharCode('\r'));

        if ( LastChar !== EOF ) {
            return gettok();
        }
    }

    // Check for end of file.  Don't eat the EOF.
    if ( LastChar === EOF ) {
        return Token.tok_eof;
    }

    const ThisChar = LastChar;
    LastChar = await getchar();
    return ThisChar;
}

//===----------------------------------------------------------------------===//
// Abstract Syntax Tree (aka Parse Tree)
//===----------------------------------------------------------------------===//

/// ExprAST - Base class for all expression nodes.
abstract class ExprAST {}

/// NumberExprAST - Expression class for numeric literals like "1.0".
class NumberExprAST extends ExprAST {
    constructor (
        public Val:number
    ) {
        super();
    }
}

/// VariableExprAST - Expression class for referencing a variable, like "a".
class VariableExprAST extends ExprAST {
    constructor(
        public Name:string
    ) {
        super();
    }
}

/// BinaryExprAST - Expression class for a binary operator.
class BinaryExprAST extends ExprAST {
    constructor(
        public Op:number,
        public LHS:ExprAST,
        public RHS:ExprAST
    ) {
        super();
    }
}

/// CallExprAST - Expression class for function calls.
class CallExprAST extends ExprAST {
    constructor(
        public Callee:string,
        public Args:ExprAST[]
    ) {
        super();
    }
}

/// PrototypeAST - This class represents the "prototype" for a function,
/// which captures its name, and its argument names (thus implicitly the number
/// of arguments the function takes).
class PrototypeAST {
    constructor(
        public Name:string,
        public Args:string[]
    ) {}
}

/// FunctionAST - This class represents a function definition itself.
class FunctionAST {
    constructor(
        public Proto:PrototypeAST,
        public Body:ExprAST
    ) {}
}

//===----------------------------------------------------------------------===//
// Parser
//===----------------------------------------------------------------------===//

/// CurTok/getNextToken - Provide a simple token buffer.  CurTok is the current
/// token the parser is looking at.  getNextToken reads another token from the
/// lexer and updates CurTok with its results.
let CurTok:number;
async function getNextToken () : Promise<number> {
    return CurTok = await gettok();
}

/// BinopPrecedence - This holds the precedence for each binary operator that is
/// defined.
const BinopPrecedence:Map<number, number> = new Map();

/// GetTokPrecedence - Get the precedence of the pending binary operator token.
function GetTokPrecedence () : number {
    // if (!isascii(CurTok)) { // TODO(Buhler): figure this out
    //     return -1
    // }

    // Make sure it's a declared binop.
    const TokPrec:number|undefined = BinopPrecedence.get(CurTok);
    if ( !TokPrec || TokPrec <= 0 ) return -1;
    return TokPrec;
}

/// LogError* - These are little helper functions for error handling.
function LogError (Str:string) : ExprAST|null {
    console.error("LogError: %s", Str);
    return null;
}
function LogErrorP (Str:string) : PrototypeAST|null {
    LogError(Str);
    return null;
}

/// numberexpr ::= number
async function ParseNumberExpr () : Promise<ExprAST> {
    const Result:NumberExprAST = new NumberExprAST(NumVal);
    await getNextToken(); // consume the number
    return Result;
}

/// parenexpr ::= '(' expression ')'
async function ParseParenExpr () : Promise<ExprAST|null> {
    await getNextToken(); // eat (.
    const V:ExprAST|null = await ParseExpression();
    if (!V) {
        return null;
    }
    if ( CurTok !== toCharCode(')') ) {
        return LogError("expected ')'");
    }
    await getNextToken(); // eat ).
    return V;
}

/// identifierexpr
///   ::= identifier
///   ::= identifier '(' expression* ')'
async function ParseIdentifierExpr () : Promise<ExprAST|null> {
    const IdName:string = IdentifierStr;

    await getNextToken(); // eat identifier.

    if ( CurTok !== toCharCode('(') ) { // Simple variable ref.
        return new VariableExprAST(IdName);
    }

    // Call.
    await getNextToken(); // eat (
    const Args:ExprAST[] = [];
    if ( CurTok !== toCharCode(')') ) {
        while (true) {
            const Arg:ExprAST|null = await ParseExpression();
            if (Arg) {
                Args.push(Arg);
            } else {
                return null;
            }

            if ( CurTok === toCharCode(')') ) {
                break;
            }

            if ( CurTok !== toCharCode(',') ) {
                return LogError("Expected ')' or ',' in argument list");
            }
            await getNextToken();
        }
    }

    // Eat the ')'.
    await getNextToken();

    return new CallExprAST(IdName, Args);
}

/// primary
///   ::= identifierexpr
///   ::= numberexpr
///   ::= parenexpr
async function ParsePrimary () : Promise<ExprAST|null> {
    switch (CurTok) {
        default:
            return LogError("unknown token when expecting an expression");
        case Token.tok_identifier:
            return ParseIdentifierExpr();
        case Token.tok_number:
            return ParseNumberExpr();
        case toCharCode('('):
            return ParseParenExpr();
    }
}

// binoprhs
///   ::= ('+' primary)*
async function ParseBinOpRHS(ExprPrec:number, LHS:ExprAST) : Promise<ExprAST|null> {
    // If this is a binop, find its precedence.
    while (true) {
        const TokPrec:number = GetTokPrecedence();

        // If this is a binop that binds at least as tightly as the current binop,
        // consume it, otherwise we are done.
        if ( TokPrec < ExprPrec ) {
            return LHS;
        }

        // Okay, we know this is a binop.
        const BinOp:number = CurTok;
        await getNextToken();  // eat binop

        // Parse the primary expression after the binary operator.
        let RHS:ExprAST|null = await ParsePrimary();
        if (!RHS) {
            return null;
        }

        // If BinOp binds less tightly with RHS than the operator after RHS, let
        // the pending operator take RHS as its LHS.
        const NextPrec:number = GetTokPrecedence();
        if ( TokPrec < NextPrec ) {
            RHS = await ParseBinOpRHS(TokPrec+1, RHS);
            if (!RHS) {
                return null;
            }
        }

        // Merge LHS/RHS.
        LHS = new BinaryExprAST(BinOp, LHS, RHS);
    } // loop around to the top of the while loop.
}

/// expression
///   ::= primary binoprhs
///
async function ParseExpression () : Promise<ExprAST|null> {
    const LHS:ExprAST|null = await ParsePrimary();
    if (!LHS) {
        return null
    }
    return ParseBinOpRHS(0, LHS);
}

/// prototype
///   ::= id '(' id* ')'
async function ParsePrototype () : Promise<PrototypeAST|null> {
    if ( CurTok !== Token.tok_identifier ) {
        return LogErrorP("Expected function name in prototype");
    }

    const FnName:string = IdentifierStr;
    await getNextToken();

    if ( CurTok !== toCharCode('(') ) {
        return LogErrorP("Expected '(' in prototype");
    }

    // Read the list of argument names.
    const ArgsNames:string[] = [];
    while ( await getNextToken() === Token.tok_identifier ) {
        ArgsNames.push(IdentifierStr);
    }
    if ( CurTok !== toCharCode(')') ) {
        return LogErrorP("Expected ')' in prototype");
    }

    // success.
    await getNextToken();

    return new PrototypeAST(FnName, ArgsNames);
}

/// definition ::= 'def' prototype expression
async function ParseDefinition () : Promise<FunctionAST|null> {
    await getNextToken(); // eat def.
    const Proto:PrototypeAST|null = await ParsePrototype();
    if (!Proto) {
        return null;
    }

    const E:ExprAST|null = await ParseExpression();
    if (E) {
        return new FunctionAST(Proto, E);
    }
    return null;
}

/// toplevelexpr ::= expression
async function ParseTopLevelExpr () : Promise<FunctionAST|null> {
    const E:ExprAST|null = await ParseExpression();
    if (E) {
        // Make an anonymous proto.
        const Proto:PrototypeAST = new PrototypeAST("", []);
        return new FunctionAST(Proto, E);
    }
    return null;
}

/// external ::= 'extern' prototype
async function ParseExtern () : Promise<PrototypeAST|null> {
    await getNextToken(); // eat extern.
    return ParsePrototype();
}

//===----------------------------------------------------------------------===//
// Top-Level parsing
//===----------------------------------------------------------------------===//

async function HandleDefinition () : Promise<void> {
    if ( await ParseDefinition() ) {
        console.error("Parsed a function definition.");
    } else {
        // Skip token for error recovery.
        await getNextToken();
    }
}

async function HandleExtern () : Promise<void> {
    if ( await ParseExtern() ) {
        console.error("Parsed an extern");
    } else {
        // Skip token for error recovery.
        await getNextToken();
    }
}

async function HandleTopLevelExpression () : Promise<void> {
    if ( await ParseTopLevelExpr() ) {
        console.error("Parsed a top-level expr");
    } else {
        // Skip token for error recovery.
        await getNextToken();
    }
}


/// top ::= definition | external | expression | ';'
async function MainLoop () : Promise<void> {
    while (true) {
        switch (CurTok) {
            case Token.tok_eof:
                return;
            case toCharCode(';'): // ignore top-level semicolons.
                await getNextToken();
                break;
            case Token.tok_def:
                await HandleDefinition();
                break;
            case Token.tok_extern:
                await HandleExtern();
                break;
            default:
                await HandleTopLevelExpression();
                break;
        }
    }
}

//===----------------------------------------------------------------------===//
// Main driver code.
//===----------------------------------------------------------------------===//

async function main () : Promise<number> {
    // Install standard binary operators.
    // 1 is lowest precedence.
    BinopPrecedence.set(toCharCode('<'), 10);
    BinopPrecedence.set(toCharCode('+'), 20);
    BinopPrecedence.set(toCharCode('-'), 30);
    BinopPrecedence.set(toCharCode('*'), 40); // highest.

    // Prime the first token.
    await getNextToken();

    // Run the main "interpreter loop" now.
    await MainLoop();

    return 0
}

main().then(process.exit);

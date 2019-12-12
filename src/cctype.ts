import { fromCharCode } from "./lib";

export function isalnum (c:number) : boolean {
    return /[a-zA-Z0-9]/.test(fromCharCode(c))
}

export function isalpha (c:number) : boolean {
    return /[a-zA-Z]/.test(fromCharCode(c));
}

export function isdigit (c:number) : boolean {
    return /[0-9]/.test(fromCharCode(c))
}

export function isspace(c:number) : boolean {
    const str:string = fromCharCode(c);
    return (
        str === ' ' ||
        str === '\t' ||
        str === '\n' ||
        str === '\v' ||
        str === '\f' ||
        str === '\r'
    );
}

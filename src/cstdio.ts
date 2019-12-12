import { toCharCode } from "./lib";

export const EOF:number = -1;

const stream:string[] = process.argv.slice(2).join(' ').split('');

export async function getchar () : Promise<number> {
    const c:string|undefined = stream.shift();
    if (c) {
        return toCharCode(c)
    }
    return EOF;
}

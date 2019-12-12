# kaleidoscope-ts

Following the "My First Language Frontend with LLVM Tutorial", with TypeScript implementation, rather than C++.

https://llvm.org/docs/tutorial/MyFirstLanguageFrontend/index.html

## Build

```shell script
> npm install
> npx tsc
```

This will generate a file at `out/main.js` designed to be executed by Node.js.

## Run

```shell script
> node out/main.js "<kaleidoscope-code>"
> node out/main.js "<kaleidoscope-code>" "<more-code>"
```

Need to work on piping in a source file.

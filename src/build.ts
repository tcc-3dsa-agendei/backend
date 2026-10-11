async function buildLinux() {
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target: "bun-linux-x64",
      outfile: "./agendei-backend-linux-x64"
    },
    splitting: true,
    sourcemap: "none",
    minify: true
  })
}

async function buildWindows() {
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target: "bun-windows-x64",
      outfile: "./agendei-backend-windows-x64"
    },
    splitting: true,
    sourcemap: "none",
    minify: true
  })
}

buildLinux()
buildWindows()

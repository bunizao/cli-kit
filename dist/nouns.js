const GLOBAL_VALUE_FLAGS = new Set(["--fields", "-o", "--output"]);
export function insertDefaultVerb(argv, nouns) {
    const result = [...argv];
    const nounIndex = findNounIndex(result, nouns);
    if (nounIndex === -1)
        return result;
    const spec = nouns.find((noun) => noun.name === result[nounIndex] || noun.aliases?.includes(result[nounIndex] ?? ""));
    if (!spec)
        return result;
    result[nounIndex] = spec.name;
    const next = result[nounIndex + 1];
    if (next && spec.verbs.includes(next))
        return result;
    if (result.includes("--help") || result.includes("-h"))
        return result;
    const arity = countPositionals(result.slice(nounIndex + 1), spec.valueFlags ?? []);
    const verb = spec.defaultByArity[arity];
    if (!verb)
        return result;
    result.splice(nounIndex + 1, 0, verb);
    return result;
}
function findNounIndex(argv, nouns) {
    const names = new Set(nouns.flatMap((noun) => [noun.name, ...(noun.aliases ?? [])]));
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token)
            continue;
        if (GLOBAL_VALUE_FLAGS.has(token)) {
            index += 1;
            continue;
        }
        if (token.startsWith("-"))
            continue;
        return names.has(token) ? index : -1;
    }
    return -1;
}
function countPositionals(argv, valueFlags) {
    const flagsWithValues = new Set([...GLOBAL_VALUE_FLAGS, ...valueFlags]);
    let count = 0;
    let terminated = false;
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--") {
            terminated = true;
            continue;
        }
        if (!terminated && token && flagsWithValues.has(token)) {
            index += 1;
            continue;
        }
        if (terminated || (token && !token.startsWith("-")))
            count += 1;
    }
    return count;
}

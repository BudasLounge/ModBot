function splitMessage(input, options = {}) {
    const maxLength = options.maxLength || 2000;
    const delimiter = options.char || '\n';
    let remaining = String(input || '');

    if (remaining.length <= maxLength) return [remaining];

    const chunks = [];
    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf(delimiter, maxLength);
        if (splitAt <= 0) splitAt = maxLength;

        const chunk = remaining.slice(0, splitAt).trimEnd();
        if (chunk.length > 0) chunks.push(chunk);

        remaining = remaining.slice(splitAt);
        if (delimiter && remaining.startsWith(delimiter)) {
            remaining = remaining.slice(delimiter.length);
        }
    }

    if (remaining.length > 0) chunks.push(remaining);
    return chunks.length > 0 ? chunks : [''];
}

module.exports = { splitMessage };

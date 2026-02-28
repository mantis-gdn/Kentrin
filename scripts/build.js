const fs = require("fs");
const { marked } = require("marked");

// Read README
const readme = fs.readFileSync("README.md", "utf8");

// Convert markdown to HTML
const readmeHtml = marked.parse(readme);

// Read template
const template = fs.readFileSync("index.template.html", "utf8");

// Replace placeholder
const output = template.replace("<!-- README_CONTENT -->", readmeHtml);

// Write final index.html
fs.writeFileSync("index.html", output, "utf8");

console.log("Built index.html from README.md");
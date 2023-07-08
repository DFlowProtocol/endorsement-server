const path = require("path");

module.exports = exports = {
    "parser": "@typescript-eslint/parser",
    "plugins": [
        "@typescript-eslint"
    ],
    "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended"
    ],
    "parserOptions": {
         "project": path.join(__dirname, "tsconfig.json"),
    },
    "rules": {
        "max-len": [
            "error",
            {
                "code": 100
            }
        ],
        "@typescript-eslint/no-unused-vars": [
            "warn",
            {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
            }
        ],
        "@typescript-eslint/switch-exhaustiveness-check": [
            "error",
        ],
    },
};

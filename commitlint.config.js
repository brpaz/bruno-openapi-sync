export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Extend the default type-enum with the two extra prefixes
    // .github/release-drafter.yml's autolabeler already recognizes.
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
        "security",
        "deps",
      ],
    ],
  },
};

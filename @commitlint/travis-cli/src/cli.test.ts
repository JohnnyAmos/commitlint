import { SpawnOptions } from "node:child_process";

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { git } from "@commitlint/test";
import { x } from "tinyexec";

const require = createRequire(import.meta.url);

const __dirname = path.resolve(fileURLToPath(import.meta.url), "..");

const bin = require.resolve("../cli.js");

const TRAVIS_COMMITLINT_BIN = require.resolve("../fixtures/commitlint");
const TRAVIS_COMMITLINT_GIT_BIN = require.resolve("../fixtures/git");

const validBaseEnv = {
	TRAVIS: "true",
	CI: "true",
	TRAVIS_COMMIT: "TRAVIS_COMMIT",
	TRAVIS_COMMITLINT_BIN: TRAVIS_COMMITLINT_BIN,
	TRAVIS_COMMITLINT_GIT_BIN: TRAVIS_COMMITLINT_GIT_BIN,
	TRAVIS_COMMIT_RANGE: "TRAVIS_COMMIT_A.TRAVIS_COMMIT_B",
	TRAVIS_EVENT_TYPE: "TRAVIS_EVENT_TYPE",
	TRAVIS_REPO_SLUG: "TRAVIS_REPO_SLUG",
	TRAVIS_PULL_REQUEST_SLUG: "TRAVIS_PULL_REQUEST_SLUG",
};

const cli = async (nodeOptions: SpawnOptions = {}, args: string[] = []) =>
	x(bin, args, { nodeOptions });

test("should throw when not on travis ci", async () => {
	const env = {
		CI: "false",
		TRAVIS: "false",
	};

	const output = await cli({ env });
	expect(output.stderr).toContain(
		"@commitlint/travis-cli is intended to be used on Travis CI",
	);
});

test("should throw when on travis ci, but env vars are missing", async () => {
	const env = {
		TRAVIS: "true",
		CI: "true",
	};

	const output = await cli({ env });
	expect(output.stderr).toContain(
		"TRAVIS_COMMIT, TRAVIS_COMMIT_RANGE, TRAVIS_EVENT_TYPE, TRAVIS_REPO_SLUG, TRAVIS_PULL_REQUEST_SLUG",
	);
});

test("should call git with expected args (test might fail locally)", async () => {
	const cwd = await git.clone(
		"https://github.com/conventional-changelog/commitlint.git",
		["--depth=10"],
		__dirname,
		TRAVIS_COMMITLINT_GIT_BIN,
	);

	const result = await cli({
		cwd,
		env: validBaseEnv,
	});

	const invocations = getInvocations(result.stdout);

	expect(invocations.length).toBe(3);

	const [stash, branches, commitlint] = invocations;

	expect(stash).toEqual(["git", "stash", "-k", "-u", "--quiet"]);
	expect(branches).toEqual(["git", "stash", "pop", "--quiet"]);
	expect(commitlint).toEqual(["commitlint"]);
});

test("should call git with expected args on pull_request (test might fail locally)", async () => {
	const cwd = await git.clone(
		"https://github.com/conventional-changelog/commitlint.git",
		["--depth=10"],
		__dirname,
		TRAVIS_COMMITLINT_GIT_BIN,
	);

	const result = await cli({
		cwd,
		env: { ...validBaseEnv, TRAVIS_EVENT_TYPE: "pull_request" },
	});
	const invocations = getInvocations(result.stdout);
	expect(invocations.length).toBe(3);

	const [stash, branches, commitlint] = invocations;

	expect(stash).toEqual(["git", "stash", "-k", "-u", "--quiet"]);
	expect(branches).toEqual(["git", "stash", "pop", "--quiet"]);
	expect(commitlint).toEqual([
		"commitlint",
		"--from",
		"TRAVIS_COMMIT_A",
		"--to",
		"TRAVIS_COMMIT_B",
	]);
});

test("should call git with extra expected args on pull_request (test might fail locally)", async () => {
	const cwd = await git.clone(
		"https://github.com/conventional-changelog/commitlint.git",
		["--depth=10"],
		__dirname,
		TRAVIS_COMMITLINT_GIT_BIN,
	);

	const result = await cli(
		{
			cwd,
			env: { ...validBaseEnv, TRAVIS_EVENT_TYPE: "pull_request" },
		},
		["--config", "./config/commitlint.config.js"],
	);
	const invocations = getInvocations(result.stdout);
	expect(invocations.length).toBe(3);

	const [stash, branches, commitlint] = invocations;

	expect(stash).toEqual(["git", "stash", "-k", "-u", "--quiet"]);
	expect(branches).toEqual(["git", "stash", "pop", "--quiet"]);
	expect(commitlint).toEqual([
		"commitlint",
		"--from",
		"TRAVIS_COMMIT_A",
		"--to",
		"TRAVIS_COMMIT_B",
		"--config",
		"./config/commitlint.config.js",
	]);
});

function getInvocations(stdout: string): string[][] {
	const matches = stdout.match(/[^[\]]+/g);
	const raw = Array.isArray(matches) ? matches : [];

	return raw
		.filter((invocation) => invocation !== "\n")
		.map((invocation) =>
			invocation
				.split(",")
				.map((fragment) => fragment.trim())
				.map((fragment) => fragment.substring(1, fragment.length - 1))
				.filter(Boolean),
		);
}

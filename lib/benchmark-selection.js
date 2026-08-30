"use strict";

const DEFAULT_BENCHMARK_PANE_PROFILE = "Benchmarks 082626";

function parseBenchmarkCliArgs(values) {
	const result = { models: [] };
	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (!String(value).startsWith("--")) continue;
		const [rawKey, inlineValue] = String(value).slice(2).split("=", 2);
		const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
		const nextValue = values[index + 1];
		const parsedValue = inlineValue ?? (nextValue && !String(nextValue).startsWith("--") ? values[++index] : true);
		if (key === "model") {
			result.models.push(parsedValue);
		} else {
			result[key] = parsedValue;
		}
	}
	return result;
}

function resolveBenchmarkSelection(args, state) {
	const rawModels = Array.isArray(args.models) ? args.models : [];
	const hasModels = rawModels.length > 0;
	const hasPaneProfile = Object.prototype.hasOwnProperty.call(args, "paneProfile");
	const hasProviderProfile = Object.prototype.hasOwnProperty.call(args, "providerProfile");

	if (hasModels && hasPaneProfile) {
		throw new Error("--pane-profile and --model cannot be combined. Choose one benchmark selection mode.");
	}
	if (hasProviderProfile && !hasModels) {
		throw new Error("--provider-profile requires at least one --model argument.");
	}

	const profiles = Array.isArray(state?.settings?.profiles) ? state.settings.profiles : [];
	if (hasModels) {
		const models = normalizeModelIds(rawModels);
		const explicitProfile = hasProviderProfile
			? resolveExplicitProviderProfile(profiles, args.providerProfile)
			: null;
		const lanes = models.map((model) => {
			const profile = explicitProfile || resolveAutomaticProviderProfile(profiles, model);
			return laneFrom(profile, model);
		});
		return {
			mode: "custom_models",
			paneProfileName: null,
			lanes
		};
	}

	const paneProfileName = hasPaneProfile
		? requireFlagValue(args.paneProfile, "--pane-profile")
		: DEFAULT_BENCHMARK_PANE_PROFILE;
	const paneProfile = (Array.isArray(state?.settings?.paneProfiles) ? state.settings.paneProfiles : [])
		.find((profile) => String(profile?.name || "") === paneProfileName);
	if (!paneProfile) throw new Error(`Pane profile not found: ${paneProfileName}`);
	if (!Array.isArray(paneProfile.panes) || paneProfile.panes.length === 0) {
		throw new Error(`Pane profile has no panes: ${paneProfileName}`);
	}
	const profileById = new Map(profiles.map((profile) => [String(profile?.id || ""), profile]));
	const lanes = paneProfile.panes.map((pane) => {
		const profileId = String(pane?.profile_id || "").trim();
		const model = String(pane?.model || "").trim();
		if (!profileId || !model) throw new Error(`Pane profile has an invalid lane: ${paneProfileName}`);
		const profile = profileById.get(profileId);
		return {
			profile_id: profileId,
			provider_profile_name: profile ? safeProfileName(profile) : null,
			model
		};
	});
	return { mode: "pane_profile", paneProfileName, lanes };
}

function normalizeModelIds(rawModels) {
	const seen = new Set();
	const models = [];
	for (const rawModel of rawModels) {
		const model = requireFlagValue(rawModel, "--model");
		if (!seen.has(model)) {
			seen.add(model);
			models.push(model);
		}
	}
	return models;
}

function resolveExplicitProviderProfile(profiles, rawReference) {
	const reference = requireFlagValue(rawReference, "--provider-profile");
	const idMatch = profiles.find((profile) => String(profile?.id || "") === reference);
	if (idMatch) return idMatch;
	const nameMatches = profiles.filter((profile) => safeProfileName(profile) === reference);
	if (nameMatches.length === 1) return nameMatches[0];
	if (nameMatches.length > 1) {
		throw new Error(`Provider profile name is ambiguous: ${reference}. Use its exact profile ID.`);
	}
	throw new Error(`Provider profile not found: ${reference}`);
}

function resolveAutomaticProviderProfile(profiles, model) {
	const matches = profiles.filter((profile) => configuredModels(profile).includes(model));
	if (matches.length === 1) return matches[0];
	if (matches.length === 0) {
		throw new Error(`No provider profile contains exact model ID "${model}". Pass --provider-profile <name-or-id>.`);
	}
	const names = matches.map(safeProfileName);
	throw new Error(`Model ID "${model}" matches multiple provider profiles: ${names.join(", ")}. Pass --provider-profile <name-or-id>.`);
}

function configuredModels(profile) {
	return String(profile?.models_csv || "")
		.split(",")
		.map((model) => model.trim())
		.filter(Boolean);
}

function laneFrom(profile, model) {
	const profileId = String(profile?.id || "").trim();
	if (!profileId) throw new Error(`Resolved provider profile for "${model}" has no ID.`);
	return {
		profile_id: profileId,
		provider_profile_name: safeProfileName(profile),
		model
	};
}

function safeProfileName(profile) {
	return String(profile?.name || profile?.id || "Unnamed provider profile").trim();
}

function requireFlagValue(value, flag) {
	if (value === true || value === undefined || value === null || !String(value).trim()) {
		throw new Error(`${flag} requires a non-empty value.`);
	}
	return String(value).trim();
}

module.exports = {
	DEFAULT_BENCHMARK_PANE_PROFILE,
	configuredModels,
	normalizeModelIds,
	parseBenchmarkCliArgs,
	resolveBenchmarkSelection
};

import alias from "./alias.mjs";
// import authentication from "./authentication.mjs";
// import database from "./database.mjs";
import deploy, { prepare as prepareDeploy } from "./deploy.mjs";
import features from "./features.mjs";
import host from "./host.mjs";
// import integrations from "./integrations.mjs";
import name from "./name.mjs";
import packageManager from "./package.mjs";
import port from "./port.mjs";
import runtime from "./runtime.mjs";
// import stateManagement from "./state-management.mjs";
import preset, { prepare as preparePreset } from "./preset.mjs";
// import thirdParty from "./third-party.mjs";
// import ui from "./ui.mjs";

export default [
  name,
  preset,
  features,
  alias,
  // thirdParty,
  // ui,
  // stateManagement,
  // database,
  // authentication,
  // integrations,
  host,
  port,
  preparePreset,
  deploy,
  runtime,
  packageManager,
  prepareDeploy,
];

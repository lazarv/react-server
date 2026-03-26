let computeCount = 0;

export async function getRequestData() {
  "use cache: request";
  await new Promise((resolve) => setTimeout(resolve, 5));
  computeCount++;
  return {
    timestamp: Date.now(),
    random: Math.random(),
    computeCount,
    createdAt: new Date(),
  };
}

let noHydrateCount = 0;

export async function getNoHydrateData() {
  "use cache: request; hydrate=false";
  await new Promise((resolve) => setTimeout(resolve, 5));
  noHydrateCount++;
  return {
    timestamp: Date.now(),
    random: Math.random(),
    computeCount: noHydrateCount,
    createdAt: new Date(),
  };
}

let suspenseCount = 0;

export async function getSuspenseData() {
  "use cache: request";
  // Longer delay to ensure this resolves after the initial Suspense shell
  await new Promise((resolve) => setTimeout(resolve, 200));
  suspenseCount++;
  return {
    timestamp: Date.now(),
    random: Math.random(),
    computeCount: suspenseCount,
  };
}

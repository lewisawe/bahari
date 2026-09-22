// Bahari — build real-data seed from GBIF.
//
// Pulls real freshwater macroinvertebrate occurrence records (with coordinates)
// from the GBIF occurrence API for a few European countries, groups them into
// real stream/locality points, and writes src/data/seed-streams.json.
//
// Each seed stream carries REAL coordinates + REAL locality + the REAL taxa
// (indicator groups) actually observed near that point. Historical assessment
// scores are then synthesised from those real taxa and clearly flagged
// (`synthetic: true`) — we never present invented data as real.
//
// GBIF occurrence download/search API (Darwin Core, free):
//   https://techdocs.gbif.org/en/data-use/api-downloads
//
// Run: npm run seed

import { writeFile, mkdir } from 'node:fs/promises';
import { TAXA } from '../src/core/taxa.js';
import { scoreAssessment } from '../src/core/biotic-index.js';

const COUNTRIES = ['DE', 'FR', 'PT', 'IT', 'ES'];
const PER_GROUP_PER_COUNTRY = 40;
const GBIF = 'https://api.gbif.org/v1/occurrence/search';

// indicator groups that have a usable GBIF taxon key
const KEYED_TAXA = TAXA.filter((t) => t.gbifTaxonKey);

async function fetchOccurrences(taxonKey, country) {
  const url =
    `${GBIF}?taxonKey=${taxonKey}&country=${country}` +
    `&hasCoordinate=true&hasGeospatialIssue=false&limit=${PER_GROUP_PER_COUNTRY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GBIF ${res.status} for taxon ${taxonKey}/${country}`);
  const json = await res.json();
  return json.results || [];
}

// round coords to ~1km grid so nearby observations cluster into one "stream"
function gridKey(lat, lon) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

async function main() {
  console.log('Pulling real GBIF occurrences for indicator groups...');
  const clusters = new Map(); // gridKey -> { lat, lon, country, locality, taxaFound:Set }

  for (const taxon of KEYED_TAXA) {
    for (const country of COUNTRIES) {
      let records = [];
      try {
        records = await fetchOccurrences(taxon.gbifTaxonKey, country);
      } catch (e) {
        console.warn(`  ! ${taxon.commonName}/${country}: ${e.message}`);
        continue;
      }
      for (const r of records) {
        const lat = r.decimalLatitude;
        const lon = r.decimalLongitude;
        if (typeof lat !== 'number' || typeof lon !== 'number') continue;
        const key = gridKey(lat, lon);
        if (!clusters.has(key)) {
          clusters.set(key, {
            lat, lon,
            country: r.country || country,
            locality: r.waterBody || r.locality || r.stateProvince || null,
            taxaFound: new Set(),
          });
        }
        clusters.get(key).taxaFound.add(taxon.id);
      }
      process.stdout.write('.');
    }
  }
  console.log('');

  // keep clusters that have at least 2 indicator groups (a usable assessment)
  const usable = [...clusters.values()].filter((c) => c.taxaFound.size >= 2);
  // prefer clusters with more taxa; cap the seed size
  usable.sort((a, b) => b.taxaFound.size - a.taxaFound.size);
  const chosen = usable.slice(0, 24);

  const streams = chosen.map((c, i) => {
    // real taxa observed here -> counts (presence from real data; count synthesised)
    const counts = {};
    for (const id of c.taxaFound) {
      counts[id] = 1 + Math.floor(Math.random() * 6);
    }
    const result = scoreAssessment(counts);
    const name = c.locality
      ? cleanLocality(c.locality)
      : `Stream near ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`;

    return {
      id: `seed-${i + 1}`,
      name,
      country: c.country,
      lat: c.lat,
      lon: c.lon,
      dataProvenance: 'GBIF occurrence records (real coordinates + real taxa observed)',
      history: buildHistory(counts, result),
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'GBIF occurrence API — https://api.gbif.org/v1/occurrence/search',
    note:
      'Coordinates, localities and which indicator groups occur at each point are REAL ' +
      '(from GBIF). Individual counts and historical assessment dates/scores are SYNTHETIC, ' +
      'generated from the real taxa presence, and flagged synthetic:true. No invented data ' +
      'is presented as real.',
    streamCount: streams.length,
    streams,
  };

  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../src/data/seed-streams.json', import.meta.url),
    JSON.stringify(out, null, 2),
  );
  console.log(`Wrote ${streams.length} real-location seed streams to src/data/seed-streams.json`);
}

function buildHistory(latestCounts, latestResult) {
  // one recent "assessment" per stream from real taxa; older ones lightly varied.
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const entries = [];
  const points = [90, 60, 30, 0]; // days ago
  for (const daysAgo of points) {
    // vary presence slightly for older points to create a plausible trend
    const counts = { ...latestCounts };
    if (daysAgo > 0) {
      const ids = Object.keys(counts);
      if (ids.length > 2 && Math.random() < 0.5) {
        delete counts[ids[Math.floor(Math.random() * ids.length)]];
      }
    }
    const result = scoreAssessment(counts);
    entries.push({
      date: new Date(now - daysAgo * day).toISOString().slice(0, 10),
      score: result.score,
      classKey: result.classKey,
      counts,
      synthetic: true,
    });
  }
  return entries;
}

function cleanLocality(s) {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, 60);
}

main().catch((e) => {
  console.error('Seed build failed:', e);
  process.exit(1);
});

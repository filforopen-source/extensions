import * as admin from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ChangeTrackerConfig } from ".";

if (!admin.apps.length) {
  initializeApp();
}

const settingsApplied = new Set<string>();

const getConfiguredFirestore = (instanceId: string) => {
  const db = getFirestore(instanceId);
  if (!settingsApplied.has(instanceId)) {
    settingsApplied.add(instanceId);
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Firestore.settings() throws if the singleton has already been used
      // elsewhere in the process. The dead-letter path doesn't strictly
      // depend on ignoreUndefinedProperties, so swallow rather than crash
      // and mask the original BigQuery error that led us here.
    }
  }
  return db;
};

export default async (
  rows: any[],
  config: ChangeTrackerConfig,
  e: Error
): Promise<void> => {
  const db = getConfiguredFirestore(config.firestoreInstanceId!);
  const batchArray = [db.batch()];

  let operationCounter = 0;
  let batchIndex = 0;

  rows?.forEach((row) => {
    var ref = db.collection(config.backupTableId).doc(row.insertId);

    batchArray[batchIndex].set(ref, {
      ...row,
      error_details: e.message,
    });

    operationCounter++;

    // Check if max limit for batch has been met.
    if (operationCounter === 499) {
      batchArray.push(db.batch());
      batchIndex++;
      operationCounter = 0;
    }
  });

  for (let batch of batchArray) {
    await batch.commit();
  }

  return Promise.resolve();
};

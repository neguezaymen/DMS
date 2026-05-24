const cron = require("node-cron");
const app = require("./app");
const env = require("./config/env");
const { applySchemaPatches } = require("./config/schemaPatches");
const { runArchivingJob } = require("./modules/archiving/archiving.service");
const {
  runExpiryNotifications,
  purgeOldNotifications,
} = require("./modules/notifications/notifications.service");
const { runWorkflowReminderJob } = require("./modules/workflows/workflows.reminder.service");
const { purgeDeletedDocuments } = require("./modules/documents/documents.service");

applySchemaPatches()
  .then(() => {
    app.listen(env.port, "0.0.0.0", () => {
      // eslint-disable-next-line no-console
      console.log(`Backend API listening on http://0.0.0.0:${env.port}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[schema-patches]", err);
    process.exit(1);
  });

// Archivage automatique quotidien (03:00 serveur)
cron.schedule(
  "0 3 * * *",
  () => {
    runArchivingJob({ actorId: null }).catch((err) =>
      // eslint-disable-next-line no-console
      console.error("[archiving-cron]", err)
    );
  },
  { timezone: process.env.CRON_TZ || "Europe/Paris" }
);

// Rappels notifications quotidiens (liens externes proches d'expiration)
cron.schedule(
  "0 8 * * *",
  () => {
    runExpiryNotifications().catch((err) =>
      // eslint-disable-next-line no-console
      console.error("[notifications-expiry-cron]", err)
    );
  },
  { timezone: process.env.CRON_TZ || "Europe/Paris" }
);

// Relances workflow en retard (toutes les heures)
cron.schedule(
  "0 * * * *",
  () => {
    runWorkflowReminderJob()
      .then((r) => {
        // eslint-disable-next-line no-console
        if (r?.reminded) console.log(`[workflow-reminder-cron] reminded=${r.reminded}`);
      })
      .catch((err) =>
        // eslint-disable-next-line no-console
        console.error("[workflow-reminder-cron]", err)
      );
  },
  { timezone: process.env.CRON_TZ || "Europe/Paris" }
);

// Nettoyage hebdomadaire des notifications lues anciennes (dimanche 04:00)
cron.schedule(
  "0 4 * * 0",
  () => {
    purgeOldNotifications({ days: Number(process.env.NOTIFICATIONS_RETENTION_DAYS || 90) })
      .then((count) => {
        // eslint-disable-next-line no-console
        console.log(`[notifications-cleanup-cron] purged=${count}`);
      })
      .catch((err) =>
        // eslint-disable-next-line no-console
        console.error("[notifications-cleanup-cron]", err)
      );
  },
  { timezone: process.env.CRON_TZ || "Europe/Paris" }
);

// Purge automatique de la corbeille (quotidien 02:30, suppression > 30 jours)
cron.schedule(
  "30 2 * * *",
  () => {
    purgeDeletedDocuments({ olderThanDays: Number(process.env.TRASH_RETENTION_DAYS || 30) })
      .then((count) => {
        // eslint-disable-next-line no-console
        if (count > 0) console.log(`[trash-cleanup-cron] purged=${count}`);
      })
      .catch((err) =>
        // eslint-disable-next-line no-console
        console.error("[trash-cleanup-cron]", err)
      );
  },
  { timezone: process.env.CRON_TZ || "Europe/Paris" }
);

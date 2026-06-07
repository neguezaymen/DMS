# DMS — Document Management System

Plateforme de gestion documentaire avec workflows de validation, recherche intelligente (pgvector), IA générative, partage et administration.

**Stack :** React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui · Node.js + Express · PostgreSQL (Neon) + pgvector

---

## Prérequis

- Node.js 20+
- Compte PostgreSQL (ex. [Neon](https://neon.tech))
- Clé **Google Gemini** (`GEMINI_API_KEY`) — recommandé, modèle économique `gemini-2.5-flash-lite`

---

## Installation

### 1. Backend

```bash
cd backend
cp .env.example .env
# Renseigner DATABASE_URL et les secrets JWT dans .env
npm install
npm run db:setup          # schéma + seed (rôles, comptes, workflows, documents démo)
npm run db:demo-docs      # recommandé : corpus IA à jour (9 docs + extraction + embeddings)
npm run db:seed-candidature   # workflow candidature + instance de test (recommandé pour la soutenance)
npm run dev               # http://localhost:3000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

### 3. Corpus démo pour l’IA _(recommandé avant les tests IA)_

Les documents démo sont optimisés pour les modules IA (extraction, conformité, Q&R, métadonnées, routage).  
**Une seule commande** régénère les fichiers, met à jour la base, extrait le texte et recalcule les embeddings :

```bash
cd backend
npm run db:demo-docs
```

> Configurez `IA_PROVIDER=gemini` + `GEMINI_API_KEY` (ou `openai` + `OPENAI_API_KEY`). Sans clé valide, les routes `/ai-studio` renvoient **503**.

Si vous avez seulement fait `db:setup` / `db:seed` et que l’IA renvoie peu de résultats, lancez `db:demo-docs` puis `npm run reindex:embeddings`.

---

## Comptes de démonstration

| Email               | Mot de passe  | Rôle           | Usage                                                    |
| ------------------- | ------------- | -------------- | -------------------------------------------------------- |
| `admin@dms.local`   | `Admin123!`   | Administrateur | Accès complet, admin, workflows, tous les documents démo |
| `rh@dms.local`      | `Rh123456!`   | RH             | Valider candidatures / lettres (étape RH des workflows)  |
| `manager@dms.local` | `Manager123!` | Manager        | Valider contrats, rapports, candidatures (étape manager) |

> Les comptes sont créés par `npm run db:seed`. L’admin voit les documents démo (visibilité privée, propriétaire admin).  
> **2FA désactivée** pour admin, RH et manager (connexion directe sans code e-mail).

---

## Documents de démonstration

**9 fichiers** générés automatiquement (visibles en tant qu’admin, propriétaire `admin@dms.local`) :

| Document                                   | Catégorie   | Intérêt pour les tests IA                                       |
| ------------------------------------------ | ----------- | --------------------------------------------------------------- |
| Rapport de stage — Sahar Neguez            | Rapport     | Q&R corpus, résumé, stack React/Node/PostgreSQL                 |
| Contrat d'alternance 2025-2026             | Contrat     | Workflow contrat, contrat « propre » (signature OK)             |
| **Contrat prestation — clauses sensibles** | Contrat     | Conformité : pénalité, non-concurrence, résiliation unilatérale |
| Facture Attijari Bank                      | Facture     | Extraction métadonnées (montant, client, n° doc, échéance)      |
| **Facture Attijari (doublon)**             | Facture     | Déduplication / alertes documents similaires                    |
| Lettre de motivation — Syrine              | Lettre      | Candidature RH, champ `Poste`                                   |
| Dossier candidature — Jean Dupont          | Candidature | Champs `Candidat` + `Poste`, workflow RH → Manager              |
| Devis commercial Telnet                    | Devis       | Routage workflow devis, montants TTC                            |
| **Politique de rétention RGPD**            | Conformité  | Scan conformité RGPD, Q&R politique / rétention                 |

Les PDF/DOCX contiennent des libellés explicites (`Client:`, `Montant TTC:`, `Candidat:`, `Poste:`, `Échéance:`) pour l’enrichissement automatique des métadonnées et des champs personnalisés.

---

## Tests IA (Gemini recommandé)

Connexion : **`admin@dms.local`** / **`Admin123!`** → menu **Hub IA** (`/ai`).

### Préparation

```bash
cd backend
npm run db:demo-docs          # corpus à jour + texte extrait + embeddings
# Optionnel si embeddings seuls à refaire :
npm run reindex:embeddings
# Optionnel — remettre les quotas IA à zéro :
node scripts/reset-ai-quota.js
```

### Parcours de test

| Fonctionnalité         | Route                               | Comment tester                                                                         |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| **Hub IA**             | `/ai`                               | Vue d’ensemble des 8 tuiles (studio, conformité, Q&R, métadonnées, routage…)           |
| **Conformité**         | `/ai/compliance`                    | Scan corpus → alertes PII (emails/téléphones), clauses sensibles sur le contrat risque |
| **Q&R corpus**         | `/ai/corpus-qa`                     | Sélectionner plusieurs docs, poser une question (voir exemples ci-dessous)             |
| **Métadonnées batch**  | `/ai/metadata`                      | Enrichir factures/devis ; cocher « appliquer aux champs personnalisés »                |
| **Routage workflow**   | `/ai/workflow-routing`              | Recommandations par catégorie (ex. Devis → validation commerciale)                     |
| **Assistant document** | Fiche doc → onglet **Assistant IA** | Résumé, chat, extraction métadonnées sur un document                                   |
| **Insights upload**    | Liste documents → upload            | Classification + doublon probable si facture proche Attijari                           |
| **AI Studio / Batch**  | Hub IA → liens studio               | Génération contrat, facture, rapport via OpenAI                                        |

### Questions Q&R corpus (exemples)

- « Quel est le montant TTC de la facture Attijari ? »
- « Quels documents concernent une candidature ou un stage ? »
- « Liste les contrats et leurs risques juridiques »
- « Quels documents mentionnent React ou Node.js ? »
- « Quelle est la politique de rétention RGPD ? »

### Résultats attendus (conformité)

| Document                   | Alertes typiques                               |
| -------------------------- | ---------------------------------------------- |
| Facture Attijari / doublon | Email, IBAN (PII)                              |
| Contrat prestation risque  | Clauses sensibles (pénalité, non-concurrence…) |
| Politique RGPD             | Email DPO                                      |
| Devis Telnet               | Téléphone contact                              |
| Contrat alternance         | Score élevé (peu ou pas d’alerte)              |

### Champs personnalisés (métadonnées)

Créés automatiquement par `db:demo-docs` / `db:seed` : Date document, Montant TTC, Client, Fournisseur, N° document, Échéance, Candidat, Poste (selon catégorie).

Tester sur **Facture Attijari Bank** ou **Devis Telnet** avec **Métadonnées batch** + application aux champs perso.

---

## Workflows

Les modèles sont créés au démarrage du backend et via le seed. Un workflow **ne démarre pas seul** à l’upload : il faut l’activer sur la fiche document (onglet **Workflow** → choisir un modèle → **Démarrer**).

| Modèle                                | Étapes                |
| ------------------------------------- | --------------------- |
| Contrat – Validation simple           | Manager → Admin       |
| Facture – Relecture                   | Comptable             |
| Rapport – Relecture qualité           | Utilisateur → Manager |
| Lettre de motivation – Validation RH  | RH                    |
| **Candidature – Validation complète** | RH → Manager          |
| **Devis – Validation commerciale**    | Manager               |

### Scénario candidature (soutenance)

```bash
cd backend && npm run db:seed-candidature
```

1. **Admin** : document **Dossier candidature — Jean Dupont** → onglet Workflow (instance déjà démarrée si seed candidature exécuté).
2. **RH** (`rh@dms.local`) : **Workflows → Mes tâches** → **Approuver** (étape 1).
3. **Manager** (`manager@dms.local`) : **Mes tâches** → **Approuver** (étape 2) → candidature validée.

L’admin peut agir à toutes les étapes sans changer de compte.

---

## Scripts backend utiles

| Commande                         | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                    | API en mode développement (nodemon)                            |
| `npm run start`                  | API production                                                 |
| `npm run db:init`                | Initialiser le schéma PostgreSQL                               |
| `npm run db:seed`                | Rôles, 3 comptes démo, workflows, documents                    |
| `npm run db:setup`               | `db:init` + `db:seed`                                          |
| `npm run db:seed-candidature`    | Workflow candidature Dupont + instance en attente RH           |
| `npm run db:demo-docs`           | Régénérer les 9 documents démo + extraction texte + embeddings |
| `npm run reindex:embeddings`     | Réindexer les embeddings (recherche vectorielle)               |
| `node scripts/reset-ai-quota.js` | Remettre à zéro quotas / historique IA générative              |
| `npm run test`                   | Tests Jest                                                     |

---

## Scripts frontend

| Commande                | Description                |
| ----------------------- | -------------------------- |
| `npm run dev`           | Serveur Vite (port 5173)   |
| `npm run build`         | Build production           |
| `npm run lint`          | ESLint                     |
| `npm run i18n:build-en` | Générer les traductions EN |

---

## Variables d'environnement

Copier `backend/.env.example` vers `backend/.env` :

| Variable                                   | Description                                                      |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `DATABASE_URL`                             | URL PostgreSQL (Neon)                                            |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets JWT                                                      |
| `FRONTEND_URL`                             | Origine CORS (défaut `http://localhost:5173`)                    |
| `IA_PROVIDER`                              | `gemini` (défaut) ou `openai`                                      |
| `GEMINI_API_KEY`                           | Clé Google AI Studio (recommandé)                                  |
| `IA_MODEL`                                 | Modèle économique : `gemini-2.5-flash-lite`                        |
| `IA_DAILY_LIMIT`                           | Quota IA par utilisateur / jour (défaut **300**)                   |
| `OPENAI_API_KEY`                           | Si `IA_PROVIDER=openai`                                            |
| `SMTP_*`                                   | _(Optionnel)_ Envoi d’emails (reset mot de passe, notifications) |

Le frontend appelle l’API sur `http://localhost:3000/api/v1` par défaut (`VITE_API_URL` pour surcharger).

---

## Structure du projet

```
DMS_Final_PFE-main/
├── backend/
│   ├── src/modules/     # documents, workflows, auth, ai, admin…
│   ├── scripts/         # init-db, seed, reindex…
│   └── uploads/         # fichiers uploadés + demo/
├── frontend/
│   └── src/
│       ├── pages/       # Documents, Workflows, Admin, IA…
│       ├── components/  # shadcn/ui + composants métier
│       └── state/       # Auth, thème, toasts
└── README.md
```

---

## Fonctionnalités principales

- **Documents** : upload, versions, catégories, tags, corbeille, archivage
- **Workflows** : modèles multi-étapes, tâches par rôle, historique, relances
- **Recherche** : classique + recherche intelligente (hybride lexical / vectorielle)
- **IA** : Hub IA (conformité, Q&R corpus, métadonnées batch, routage workflow), studio génératif, batch, assistant par document, insights à l’upload
- **Partage** : liens publics, demandes d’upload externes, droits granulaires
- **Admin** : utilisateurs, départements, champs personnalisés, audit, paramètres

---

## Licence

Projet académique — PFE / soutenance.

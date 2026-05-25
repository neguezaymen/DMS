# DMS — Document Management System

Plateforme de gestion documentaire avec workflows de validation, recherche intelligente (pgvector), IA générative, partage et administration.

**Stack :** React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui · Node.js + Express · PostgreSQL (Neon) + pgvector

---

## Prérequis

- Node.js 20+
- Compte PostgreSQL (ex. [Neon](https://neon.tech))
- *(Optionnel)* Clé OpenAI pour embeddings / chat IA (sinon mode démo local)

---

## Installation

### 1. Backend

```bash
cd backend
cp .env.example .env
# Renseigner DATABASE_URL et les secrets JWT dans .env
npm install
npm run db:setup          # schéma + seed (rôles, comptes, workflows, documents démo)
npm run db:seed-candidature   # workflow candidature + instance de test (recommandé pour la soutenance)
npm run dev               # http://localhost:3000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

### 3. Recherche vectorielle *(optionnel)*

Après le seed, indexer les documents démo pour la recherche intelligente :

```bash
cd backend
npm run reindex:embeddings
```

---

## Comptes de démonstration

| Email | Mot de passe | Rôle | Usage |
|-------|--------------|------|--------|
| `admin@dms.local` | `Admin123!` | Administrateur | Accès complet, admin, workflows, tous les documents démo |
| `rh@dms.local` | `Rh123456!` | RH | Valider candidatures / lettres (étape RH des workflows) |
| `manager@dms.local` | `Manager123!` | Manager | Valider contrats, rapports, candidatures (étape manager) |

> Les comptes sont créés par `npm run db:seed`. L’admin voit les documents démo (visibilité privée, propriétaire admin).  
> **2FA désactivée** pour admin, RH et manager (connexion directe sans code e-mail).

---

## Documents de démonstration

6 fichiers générés automatiquement (visibles en tant qu’admin) :

| Document | Catégorie |
|----------|-----------|
| Rapport de stage — Sahar Neguez | Rapport |
| Contrat d'alternance 2025 | Contrat |
| Facture Attijari Bank | Facture |
| Lettre de motivation — Syrine | Lettre |
| **Dossier candidature — Jean Dupont** | Candidature |
| Devis commercial Telnet | Devis |

---

## Workflows

Les modèles sont créés au démarrage du backend et via le seed. Un workflow **ne démarre pas seul** à l’upload : il faut l’activer sur la fiche document (onglet **Workflow** → choisir un modèle → **Démarrer**).

| Modèle | Étapes |
|--------|--------|
| Contrat – Validation simple | Manager → Admin |
| Facture – Relecture | Comptable |
| Rapport – Relecture qualité | Utilisateur → Manager |
| Lettre de motivation – Validation RH | RH |
| **Candidature – Validation complète** | RH → Manager |

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

| Commande | Description |
|----------|-------------|
| `npm run dev` | API en mode développement (nodemon) |
| `npm run start` | API production |
| `npm run db:init` | Initialiser le schéma PostgreSQL |
| `npm run db:seed` | Rôles, 3 comptes démo, workflows, documents |
| `npm run db:setup` | `db:init` + `db:seed` |
| `npm run db:seed-candidature` | Workflow candidature Dupont + instance en attente RH |
| `npm run db:demo-docs` | Régénérer les fichiers documents démo |
| `npm run reindex:embeddings` | Réindexer les embeddings pour la recherche vectorielle |
| `npm run test` | Tests Jest |

---

## Scripts frontend

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur Vite (port 5173) |
| `npm run build` | Build production |
| `npm run lint` | ESLint |
| `npm run i18n:build-en` | Générer les traductions EN |

---

## Variables d'environnement

Copier `backend/.env.example` vers `backend/.env` :

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL PostgreSQL (Neon) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets JWT |
| `FRONTEND_URL` | Origine CORS (défaut `http://localhost:5173`) |
| `OPENAI_API_KEY` | *(Optionnel)* Embeddings + chat IA |
| `SMTP_*` | *(Optionnel)* Envoi d’emails (reset mot de passe, notifications) |

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
- **IA** : studio génératif, batch, suggestions à l’upload
- **Partage** : liens publics, demandes d’upload externes, droits granulaires
- **Admin** : utilisateurs, départements, champs personnalisés, audit, paramètres

---

## Licence

Projet académique — PFE / soutenance.

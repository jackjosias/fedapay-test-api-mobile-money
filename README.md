# Projet de Test d'Intégration FedaPay

## Contexte et Objectif

Ce projet a été mis en place dans le cadre d'une session de développement guidée pour explorer et tester les fonctionnalités de la passerelle de paiement africaine **FedaPay** en utilisant un backend **Node.js avec Express.js** et un frontend simple en **HTML/CSS/JS**.

L'objectif principal est de valider le processus d'intégration FedaPay en mode **Sandbox (test)**, incluant :

*   L'initiation d'une transaction de paiement depuis le frontend.
*   La création de cette transaction via l'API FedaPay depuis le backend.
*   La gestion du **Callback URL** (redirection synchrone de l'utilisateur après le paiement).
*   La gestion des **Webhooks** (notifications asynchrones serveur-à-serveur envoyées par FedaPay).

Ce document sert de guide complet, récapitulant l'architecture mise en place, les étapes d'installation et de configuration, les explications du code, le flux des interactions, les données de test cruciales, et la résolution des divers problèmes rencontrés durant le processus de développement.

## Architecture Adoptée

Le projet suit une architecture simple de type client-serveur, avec une séparation claire entre :

*   **Frontend (`fedapay-frontend/`) :** Un ensemble de fichiers HTML, CSS et JavaScript simples pour présenter un formulaire de paiement et les pages de résultat (succès, annulation, en attente). Il initie la demande de paiement vers le backend.
*   **Backend (`fedapay-express-backend/`) :** Une application Node.js utilisant le framework Express.js. Ce backend interagit directement avec l'API FedaPay (via la librairie FedaPay officielle pour Node.js), gère la logique de création de transaction, reçoit les callbacks et traite les webhooks.

```
├── fedapay-express-backend/
│   ├── node_modules/
│   ├── package-lock.json
│   ├── package.json
│   └── server.js
└── fedapay-frontend/
    ├── cancel.html
    ├── index.html
    ├── pending.html
    └── success.html
```

## Prérequis

Pour exécuter ce projet localement, vous aurez besoin de :

*   **Node.js et npm (ou yarn) :** Environnement d'exécution JavaScript et gestionnaire de paquets pour le backend.
*   **Un éditeur de code :** Comme VS Code, recommandé pour sa facilité d'utilisation et ses extensions.
*   **Une extension "Live Server" (pour VS Code) ou un serveur HTTP local simple :** Pour servir les fichiers du frontend (`fedapay-frontend/`) via HTTP et éviter les problèmes liés à l'ouverture directe de fichiers `file:///`.
*   **Un compte FedaPay :** En mode Sandbox (test). Vous aurez besoin de vos clés API (publique et secrète de test) et de configurer un point de terminaison Webhook pour obtenir son secret.
*   **ngrok (optionnel mais recommandé pour les webhooks) :** Un outil de tunneling pour exposer votre serveur local à l'internet public, permettant à FedaPay d'envoyer les webhooks.

## Installation et Configuration Détaillée

Suivez ces étapes pour mettre en place le projet :

1.  **Créez la structure des dossiers :**
    ```bash
    # Naviguez vers votre répertoire de projet
    cd /home/jack-josias/sys/systemd/sysctl/sysstat/config/linux/Fedapay Fo Charly/

    # Créez les dossiers pour le backend et le frontend
    mkdir fedapay-express-backend
    mkdir fedapay-frontend
    ```

2.  **Initialisez le projet backend et installez les dépendances :**
    ```bash
    # Naviguez dans le dossier backend
    cd fedapay-express-backend

    # Initialisez un projet Node.js
    npm init -y # ou yarn init -y

    # Installez les dépendances nécessaires
    npm install express fedapay body-parser cors # ou yarn add express fedapay body-parser cors
    ```
    *   `express`: Framework web pour Node.js.
    *   `fedapay`: Librairie officielle FedaPay pour Node.js.
    *   `body-parser`: Middleware pour parser les corps de requêtes HTTP (nécessaire pour les webhooks).
    *   `cors`: Middleware pour gérer les requêtes cross-origin (utile en développement local lorsque frontend et backend ont des origines différentes).

3.  **Créez le fichier `server.js` pour le backend :**
    Créez un fichier nommé `server.js` dans le répertoire `fedapay-express-backend/`.

4.  **Ajoutez le code de base au `server.js` :**
    Copiez-collez le code complet suivant dans `fedapay-express-backend/server.js`. Ce code inclut la configuration de base, les middlewares, et les routes pour la création de paiement, le callback et les webhooks.

    ```javascript
    // server.js
    const express = require('express');
    const bodyParser = require('body-parser');
    const cors = require('cors'); // Importation du middleware cors
    const { FedaPay, Transaction, Customer, Webhook } = require('fedapay');

    const app = express();
    const port = process.env.PORT || 3000; // Utilisez une variable d\'environnement pour le port

    // --- Configuration FedaPay ---
    // Remplacez par VOTRE_CLE_API_SECRETE de TEST (obtenue dans le dashboard FedaPay sandbox)
    const FEDAPAY_SECRET_KEY = "sk_sandbox_VOTRE_CLE_API_SECRETE_DE_TEST"; // IMPORTANT: Utilisez votre clé secrète de TEST
    const FEDAPAY_ENVIRONMENT = 'sandbox'; // ou 'live' en production

    FedaPay.setApiKey(FEDAPAY_SECRET_KEY);
    FedaPay.setEnvironment(FEDAPAY_ENVIRONMENT);

    // --- Middlewares ---
    app.use(cors()); // Utilisation du middleware cors pour autoriser les requêtes cross-origin (nécessaire en dev)
    // Pour parser les requêtes JSON du frontend
    app.use(express.json());
    // Pour parser les requêtes URL-encoded (si besoin)
    app.use(express.urlencoded({ extended: true }));

    // --- Routes ---

    // Route pour créer une transaction de collecte (appelée par le frontend)
    app.post('/create-payment', async (req, res) => {
        try {
            const { amount, description, customer_email, customer_firstname, customer_lastname, callback_url_from_frontend } = req.body;

            if (!amount || !description || !customer_email || !callback_url_from_frontend) {
                return res.status(400).json({ error: 'Données manquantes pour la création du paiement.' });
            }

            const transactionData = {
                description: description,
                amount: parseInt(amount), // Le montant doit être un entier
                currency: { iso: 'XOF' }, // Devise, ex: XOF
                callback_url: callback_url_from_frontend, // URL de callback fournie par le frontend (doit pointer vers le backend)
                customer: {
                    firstname: customer_firstname || 'PrénomTest',
                    lastname: customer_lastname || 'NomTest',
                    email: customer_email,
                    // phone_number: { number: '+22997000000', country: 'bj' } // Optionnel
                }
            };

            const transaction = await Transaction.create(transactionData);
            const tokenObject = await transaction.generateToken();

            res.json({ paymentUrl: tokenObject.url });

        } catch (error) {
            console.error('Erreur lors de la création de la transaction FedaPay:', error);
            res.status(500).json({ error: error.message || 'Erreur serveur lors de la création du paiement.' });
        }
    });

    // Route pour gérer le callback FedaPay (après que l'utilisateur ait payé ou annulé - redirigé par FedaPay)
    app.get('/payment-callback', async (req, res) => {
        const transactionId = req.query.id;
        const statusFromUrl = req.query.status; // ex: 'approved', 'canceled', 'pending'

        if (!transactionId) {
            return res.status(400).send('ID de transaction manquant dans le callback.');
        }

        try {
            // ATTENTION: Vérifiez TOUJOURS le statut réel de la transaction auprès de l'API FedaPay.
            // Ne vous fiez pas uniquement au statut dans l'URL.
            const transaction = await Transaction.retrieve(transactionId);
            const actualStatus = transaction.status;
            console.log(`Callback reçu pour transaction ${transactionId}. Statut URL: ${statusFromUrl}, Statut API: ${actualStatus}`);

            // Logique métier ici :
            // - Mettre à jour votre base de données avec le statut réel.
            // - Envoyer un email de confirmation, etc.

            // Rediriger vers les pages du frontend en incluant le sous-chemin /fedapay-frontend/
            if (actualStatus === 'approved') {
                res.redirect(`http://localhost:5500/fedapay-frontend/success.html?transaction_id=${transactionId}`); // Adaptez l\'URL du frontend si besoin
            } else if (actualStatus === 'canceled' || actualStatus === 'declined') {
                res.redirect(`http://localhost:5500/fedapay-frontend/cancel.html?transaction_id=${transactionId}&status=${actualStatus}`); // Adaptez l\'URL du frontend si besoin
            } else {
                // Gérer d\'autres statuts si nécessaire, comme 'pending'
                res.redirect(`http://localhost:5500/fedapay-frontend/pending.html?transaction_id=${transactionId}&status=${actualStatus}`); // Adaptez l\'URL du frontend si besoin
            }

        } catch (error) {
            console.error('Erreur lors de la vérification du callback FedaPay:', error);
            res.status(500).send('Erreur serveur lors du traitement du callback.');
        }
    });

    // Route pour gérer les webhooks FedaPay (appelée par FedaPay de manière asynchrone)
    // IMPORTANT: Cette route doit parser le corps de la requête en 'raw' pour la vérification de la signature.
    app.post('/fedapay-webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
        const signature = req.headers['x-fedapay-signature'];
        // Remplacez par le secret de VOTRE point de terminaison webhook configuré dans le dashboard FedaPay (mode test)
        const endpointSecret = 'wh_sandbox_VOTRE_SECRET_DE_WEBHOOK'; // Ce secret est différent de votre clé API secrète.
                                                                    // Vous l\'obtenez lors de la création du webhook dans votre dashboard FedaPay.

        let event;

        try {
            event = Webhook.constructEvent(req.body, signature, endpointSecret);
        } catch (err) {
            console.error(`⚠️  Webhook signature verification failed: ${err.message}`);
            // Renvoyer une réponse 400 en cas d\'échec de la vérification de signature est une bonne pratique
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Gérer l\'événement
        console.log('Webhook reçu:', event.name, event.data.object);
        switch (event.name) {
            case 'transaction.approved':
                const transactionApproved = event.data.object;
                console.log(`Webhook: Transaction approuvée - ID: ${transactionApproved.id}, Statut: ${transactionApproved.status}`);
                // Logique métier: Confirmer la commande, donner accès au service, etc.
                // C\'est une confirmation serveur-à-serveur, plus fiable que le callback seul.
                break;
            case 'transaction.canceled':
                const transactionCanceled = event.data.object;
                 console.log(`Webhook: Transaction annulée - ID: ${transactionCanceled.id}, Statut: ${transactionCanceled.status}`);
                // Logique métier: Annuler la commande, etc.
                break;
            case 'transaction.declined':
                const transactionDeclined = event.data.object;
                 console.log(`Webhook: Transaction déclinée - ID: ${transactionDeclined.id}, Statut: ${transactionDeclined.status}`);
                // Logique métier: Informer l\'utilisateur, etc.
                break;
            // Ajoutez d\'autres cas d\'événements que vous souhaitez gérer
            // Voir la liste des événements dans la documentation FedaPay
            default:
                console.log(`Webhook: Événement non géré - Type: ${event.name}`);
        }

        // Renvoyer une réponse 2xx pour accuser réception de l\'événement
        res.status(200).json({ received: true });
    });


    // Démarrer le serveur
    app.listen(port, () => {
        console.log(`Serveur Express.js écoutant sur http://localhost:${port}`);
        console.log(`Assurez-vous que FedaPay est configuré pour l\'environnement: ${FEDAPAY_ENVIRONMENT}`);
    });

    ```

5.  **Créez les fichiers HTML pour le frontend :**
    Créez les fichiers `index.html`, `success.html`, `cancel.html`, et `pending.html` dans le répertoire `fedapay-frontend/`.

6.  **Ajoutez le code aux fichiers HTML du frontend :**
    Copiez-collez les codes complets suivants dans les fichiers correspondants. Ces codes incluent l'intégration de Bootstrap 5, la police Roboto, les classes Bootstrap pour le style et la réactivité, les animations et les améliorations UI/UX demandées.

    **`fedapay-frontend/index.html`**

    ```html
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Paiement FedaPay - Initiation</title>
        <!-- Bootstrap CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <!-- Bootstrap Icons CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet">
        <!-- Google Fonts - Roboto -->
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Roboto', sans-serif;
                background: linear-gradient(135deg, #f5f7fa, #c3cfe2); /* Subtle gradient */
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .card-custom {
                background-color: #ffffff; /* White background */
                border-radius: 15px; /* More rounded corners */
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15); /* Softer shadow */
                overflow: hidden; /* Ensures gradient/shadows are contained */
            }
            .card-header-custom {
                background-color: #007bff; /* Primary color */
                color: white;
                padding: 20px;
                text-align: center;
                font-size: 1.5rem;
                font-weight: 700;
            }
            .form-container {
                padding: 30px;
            }
            .form-label {
                font-weight: 500;
                margin-bottom: 5px;
            }
            .form-control:focus {
                border-color: #007bff; /* Highlight on focus */
                box-shadow: 0 0 0 0.25rem rgba(0, 123, 255, 0.25); /* Focus ring */
            }
            .btn-primary {
                background-color: #007bff; /* Primary color */
                border-color: #007bff; /* Primary color */
                transition: background-color 0.3s ease, transform 0.1s ease; /* Smooth hover effect */
            }
            .btn-primary:hover {
                background-color: #0056b3; /* Darker on hover */
                border-color: #0056b3; /* Darker on hover */
                transform: translateY(-1px); /* Subtle lift effect */
            }
            .alert-custom {
                 margin-top: 20px;
                 padding: 15px;
                 border-radius: 8px;
                 animation: fadeIn 0.5s ease-out;
            }
            .alert-success-custom {
                background-color: #d4edda; /* Success background */
                color: #155724; /* Success text */
                border: 1px solid #c3e6cb; /* Success border */
            }
            .alert-danger-custom {
                background-color: #f8d7da; /* Danger background */
                color: #721c24; /* Danger text */
                border: 1px solid #f5c6cb; /* Danger border */
            }
             @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-md-8 col-lg-6">
                    <div class="card card-custom">
                        <div class="card-header card-header-custom">
                             <i class="bi bi-credit-card-2-front me-2"></i> Initialiser un Paiement FedaPay
                        </div>
                        <div class="card-body form-container">
                             <form id="paymentForm">
                                <div class="mb-3">
                                    <label for="amount" class="form-label">Montant (XOF):</label>
                                    <input type="number" class="form-control" id="amount" name="amount" value="100" required>
                                </div>
                                <div class="mb-3">
                                    <label for="description" class="form-label">Description:</label>
                                    <input type="text" class="form-control" id="description" name="description" value="Test de produit FedaPay" required>
                                </div>
                                <div class="mb-3">
                                    <label for="email" class="form-label">Email Client:</label>
                                    <input type="email" class="form-control" id="email" name="email" value="test@example.com" required>
                                </div>
                                <!-- Vous pouvez ajouter d\'autres champs client si besoin avec les classes form-label et form-control -->
                                <button type="submit" class="btn btn-primary w-100"><i class="bi bi-wallet2 me-2"></i> Payer avec FedaPay</button>
                            </form>
                             <div id="message" class="alert-custom"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bootstrap JS -->
        <script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.min.js"></script>

        <script>
            const paymentForm = document.getElementById('paymentForm');
            const messageDiv = document.getElementById('message');

            paymentForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                messageDiv.textContent = '';
                messageDiv.className = 'alert-custom'; // Reset classes

                const formData = new FormData(paymentForm);
                const data = {
                    amount: formData.get('amount'),
                    description: formData.get('description'),
                    customer_email: formData.get('email'),
                    // L\'URL de callback doit pointer vers la route de callback de votre backend
                    callback_url_from_frontend: 'http://localhost:3000/payment-callback'
                };

                try {
                    const response = await fetch('http://localhost:3000/create-payment', { // URL de votre backend Express
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(data),
                    });

                    const result = await response.json();

                    if (response.ok && result.paymentUrl) {
                        messageDiv.textContent = 'Redirection vers FedaPay...';
                        messageDiv.classList.add('alert-success-custom');
                        // Ajout d\'une petite animation avant redirection (optionnel)
                        setTimeout(() => {
                            window.location.href = result.paymentUrl;
                        }, 500); // Redirige après 500ms

                    } else {
                        messageDiv.textContent = `Erreur: ${result.error || 'Impossible de générer le lien de paiement.'}`;
                        messageDiv.classList.add('alert-danger-custom');
                    }
                } catch (error) {
                    console.error('Erreur fetch:', error);
                    messageDiv.textContent = 'Erreur de communication avec le serveur.';
                    messageDiv.classList.add('alert-danger-custom');
                }
            });
        </script>
        <!-- Bootstrap JS -->
        <script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.min.js"></script>
    </body>
    </html>
    ```

    **`fedapay-frontend/success.html`**

    ```html
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Paiement FedaPay - Succès</title>
        <!-- Bootstrap CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <!-- Bootstrap Icons CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet">
        <!-- Google Fonts - Roboto -->
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Roboto', sans-serif;
                background: linear-gradient(135deg, #f5f7fa, #d4edda); /* Subtle gradient */
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .card-custom {
                background-color: #ffffff; /* White background */
                border-radius: 15px; /* More rounded corners */
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15); /* Softer shadow */
                overflow: hidden; /* Ensures gradient/shadows are contained */
                 border: none; /* Remove default card border */
            }
             .card-header-custom-success {
                background-color: #28a745; /* Bootstrap Success color */
                color: white;
                padding: 20px;
                text-align: center;
                font-size: 1.5rem;
                font-weight: 700;
            }
            .card-body-custom {
                padding: 30px;
                text-align: center;
            }
            .icon-large {
                font-size: 4rem;
                color: #28a745; /* Bootstrap Success color */
                margin-bottom: 20px;
                 animation: bounceIn 0.6s ease-out;
            }
             @keyframes bounceIn {
                0% {
                    transform: scale(0.3);
                    opacity: 0;
                }
                50% {
                    transform: scale(1.1);
                    opacity: 1;
                }
                70% {
                    transform: scale(0.9);
                }
                100% {
                    transform: scale(1);
                }
            }
             .link-return {
                margin-top: 20px;
                display: inline-block; /* Allows padding and margins */
                color: #007bff; /* Bootstrap Primary color */
                text-decoration: none;
                 transition: color 0.3s ease;
            }
            .link-return:hover {
                color: #0056b3; /* Darker on hover */
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-md-8 col-lg-6">
                    <div class="card card-custom">
                        <div class="card-header card-header-custom-success">
                            <i class="bi bi-check-circle-fill me-2"></i> Paiement Réussi !
                        </div>
                        <div class="card-body card-body-custom">
                             <i class="bi bi-check-circle-fill icon-large"></i>
                            <p class="lead mb-3">Votre transaction a été approuvée.</p>
                            <p id="transactionInfo" class="h5 mb-4"></p>
                            <a href="http://localhost:5500/fedapay-frontend/index.html" class="link-return">Retour à l\'accueil</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bootstrap JS (Optional, but good practice to include) -->
        <script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.min.js"></script>

        <script>
            const params = new URLSearchParams(window.location.search);
            const transactionId = params.get('transaction_id');
            if (transactionId) {
                document.getElementById('transactionInfo').textContent = `ID de Transaction : ${transactionId}`;
            }
        </script>
    </body>
    </html>
    ```

    **`fedapay-frontend/cancel.html`**

    ```html
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Paiement FedaPay - Annulation</title>
        <!-- Bootstrap CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <!-- Bootstrap Icons CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet">
        <!-- Google Fonts - Roboto -->
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Roboto', sans-serif;
                background: linear-gradient(135deg, #f5f7da, #f8d7da); /* Subtle gradient */
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .card-custom {
                background-color: #ffffff; /* White background */
                border-radius: 15px; /* More rounded corners */
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15); /* Softer shadow */
                overflow: hidden; /* Ensures gradient/shadows are contained */
                 border: none; /* Remove default card border */
            }
            .card-header-custom-cancel {
                background-color: #dc3545; /* Bootstrap Danger color */
                color: white;
                padding: 20px;
                text-align: center;
                font-size: 1.5rem;
                font-weight: 700;
            }
            .card-body-custom {
                padding: 30px;
                text-align: center;
            }
            .icon-large {
                font-size: 4rem;
                color: #dc3545; /* Bootstrap Danger color */
                margin-bottom: 20px;
                 animation: shake 0.8s ease-in-out;
            }
             @keyframes shake {
                0%, 100% {
                    transform: translateX(0);
                }
                10%, 30%, 50%, 70%, 90% {
                    transform: translateX(-5px);
                }
                20%, 40%, 60%, 80% {
                    transform: translateX(5px);
                }
            }
            .link-return {
                margin-top: 20px;
                display: inline-block; /* Allows padding and margins */
                color: #007bff; /* Bootstrap Primary color */
                text-decoration: none;
                 transition: color 0.3s ease;
            }
            .link-return:hover {
                color: #0056b3; /* Darker on hover */
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-md-8 col-lg-6">
                    <div class="card card-custom">
                        <div class="card-header card-header-custom-cancel">
                            <i class="bi bi-x-circle-fill me-2"></i> Paiement Annulé ou Échoué
                        </div>
                        <div class="card-body card-body-custom">
                             <i class="bi bi-x-circle-fill icon-large"></i>
                            <p class="lead mb-3">Votre transaction n'a pas pu être complétée ou a été annulée.</p>
                            <p id="transactionInfo" class="h5 mb-4"></p>
                            <a href="http://localhost:5500/fedapay-frontend/index.html" class="link-return">Retour à l\'accueil</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bootstrap JS (Optional, but good practice to include) -->
        <script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.min.js"></script>

        <script>
            const params = new URLSearchParams(window.location.search);
            const transactionId = params.get('transaction_id');
            const status = params.get('status');
            if (transactionId) {
                document.getElementById('transactionInfo').textContent = `ID de Transaction : ${transactionId}, Statut : ${status || 'N/A'}`;
            }
        </script>
    </body>
    </html>
    ```

    **`fedapay-frontend/pending.html`**

    ```html
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Paiement FedaPay - En Attente</title>
        <!-- Bootstrap CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <!-- Bootstrap Icons CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet">
        <!-- Google Fonts - Roboto -->
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Roboto', sans-serif;
                background: linear-gradient(135deg, #f0ead6, #fff3cd); /* Subtle gradient */
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .card-custom {
                background-color: #ffffff; /* White background */
                border-radius: 15px; /* More rounded corners */
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15); /* Softer shadow */
                overflow: hidden; /* Ensures gradient/shadows are contained */
                border: none; /* Remove default card border */
            }
            .card-header-custom-pending {
                background-color: #ffc107; /* Bootstrap Warning color */
                color: #343a40; /* Dark text for contrast */
                padding: 20px;
                text-align: center;
                font-size: 1.5rem;
                font-weight: 700;
            }
            .card-body-custom {
                padding: 30px;
                text-align: center;
            }
            .icon-large {
                font-size: 4rem;
                color: #ffc107; /* Bootstrap Warning color */
                margin-bottom: 20px;
                 animation: pulse 2s infinite alternate; /* Subtle pulse animation */
            }
             @keyframes pulse {
                0% {
                    transform: scale(1);
                    opacity: 0.8;
                }
                100% {
                    transform: scale(1.05);
                    opacity: 1;
                }
            }
            .link-return {
                margin-top: 20px;
                display: inline-block; /* Allows padding and margins */
                color: #007bff; /* Bootstrap Primary color */
                text-decoration: none;
                 transition: color 0.3s ease;
            }
            .link-return:hover {
                color: #0056b3; /* Darker on hover */
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-md-8 col-lg-6">
                    <div class="card card-custom">
                        <div class="card-header card-header-custom-pending">
                            <i class="bi bi-exclamation-triangle-fill me-2"></i> Paiement en Attente
                        </div>
                        <div class="card-body card-body-custom">
                             <i class="bi bi-exclamation-triangle-fill icon-large"></i>
                            <p class="lead mb-3">Votre transaction est en cours de traitement ou en attente.</p>
                            <p id="transactionInfo" class="h5 mb-4"></p>
                            <a href="http://localhost:5500/fedapay-frontend/index.html" class="link-return">Retour à l\'accueil</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bootstrap JS (Optional, but good practice to include) -->
        <script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.min.js"></script>

        <script>
            const params = new URLSearchParams(window.location.search);
            const transactionId = params.get('transaction_id');
            const status = params.get('status');
            if (transactionId) {
                document.getElementById('transactionInfo').textContent = `ID de Transaction : ${transactionId}, Statut : ${status || 'N/A'}`;
            }
        </script>
    </body>
    </html>
    ```

7.  **Configuration du Webhook FedaPay :**
    *   Connectez-vous à votre dashboard FedaPay en mode **Sandbox**.
    *   Naviguez vers **Développeurs -> Webhooks**.
    *   Cliquez sur **Créer un Webhook**.
    *   **URL :** Saisissez l\'URL publique qui pointe vers votre route `/fedapay-webhook`. Si vous utilisez **ngrok** pour exposer votre serveur local (tournant par défaut sur le port 3000), lancez-le avec `ngrok http 3000`. Copiez l\'URL HTTPS fournie par ngrok et ajoutez `/fedapay-webhook`.
        Exemple : `https://abcdef123456.ngrok.io/fedapay-webhook`
    *   **Désactiver la vérification SSL :** Laissez décoché si vous utilisez HTTPS (recommandé).
    *   **Désactiver le webhook en cas d\'erreurs :** Activez cette option pendant le développement.
    *   **Type d\'événements :** Sélectionnez les ��vénements que vous souhaitez recevoir (par exemple, `transaction.approved`, `transaction.canceled`, `transaction.declined`).
    *   Cliquez sur **Créer**.
    *   Après la création, FedaPay affichera le **"Secret du point de terminaison"**. **Copiez cette valeur EXACEMENT.**

8.  **Mettez à jour le `endpointSecret` dans `server.js` :**
    Ouvrez `fedapay-express-backend/server.js` et remplacez le placeholder de `endpointSecret` par la valeur exacte que vous avez copiée depuis le dashboard FedaPay.

    ```javascript
    const endpointSecret = 'wh_sandbox_VOTRE_SECRET_DE_WEBHOOK_COPIE'; // Remplacez EXACEMENT
    ```

9.  **Redémarrez votre serveur backend** après avoir mis à jour le `endpointSecret` pour prendre en compte le changement.

## Explication du Code Clé

### Backend (`server.js`)

*   **Configuration FedaPay:** Initialise la librairie FedaPay avec vos clés API et l\'environnement (`sandbox`).
*   **Middlewares:**
    *   `cors()`: Permet aux requêtes cross-origin depuis votre frontend.
    *   `express.json()` et `express.urlencoded()`: Parsent les corps de requêtes JSON et URL-encoded.
    *   `bodyParser.raw()`: Essentiel pour la route webhook afin d\'obtenir le corps brut nécessaire à la vérification de signature.
*   **`/create-payment` (POST):**
    *   Reçoit les détails du paiement du frontend.
    *   Crée un objet `transactionData` conforme à l\'API FedaPay.
    *   Appelle `Transaction.create()` pour créer la transaction chez FedaPay.
    *   Appelle `transaction.generateToken()` pour obtenir l\'URL de paiement FedaPay.
    *   Renvoie l\'URL de paiement au frontend.
*   **`/payment-callback` (GET):**
    *   Route vers laquelle FedaPay redirige le navigateur de l\'utilisateur après interaction sur la page de paiement.
    *   Récupère l\'ID et le statut de la transaction depuis les paramètres de l\'URL.
    *   Appelle `Transaction.retrieve()` pour obtenir le statut **réel et final** de la transaction auprès de l\'API FedaPay (crucial pour la sécurité).
    *   Loggue les statuts reçus.
    *   **Redirige le navigateur de l\'utilisateur** vers la page frontend appropriée (`success.html`, `cancel.html`, ou `pending.html`) en incluant le sous-chemin `/fedapay-frontend/` pour correspondre à la structure servie par Live Server.
*   **`/fedapay-webhook` (POST):**
    *   Route appelée par FedaPay de manière asynchrone lorsqu\'un événement (ex: `transaction.approved`) se produit.
    *   Récupère la signature de l\'en-tête `X-FEDAPAY-SIGNATURE`.
    *   Utilise `Webhook.constructEvent()` avec le corps brut de la requête, la signature et le `endpointSecret` pour **vérifier l\'authenticité** de la requête.
    *   Si la signature est valide, traite l\'événement (`switch` sur `event.name`).
    *   Loggue l\'événement reçu.
    *   Renvoie une réponse HTTP 200 pour accuser réception. En cas d\'échec de vérification, renvoie un 400.

### Frontend (`fedapay-frontend/*.html`)

*   **`index.html`:** Contient un formulaire simple pour collecter le montant, la description et l\'email. Le script JavaScript intercepte la soumission du formulaire, envoie une requête `fetch` **POST** à `http://localhost:3000/create-payment` (votre backend), et redirige le navigateur vers l\'`paymentUrl` reçue en réponse. Inclut l\'intégration Bootstrap, Roboto et les styles améliorés. Le `callback_url_from_frontend` envoyé au backend est fixe (`http://localhost:3000/payment-callback`).
*   **`success.html`, `cancel.html`, `pending.html`:** Pages statiques pour afficher le résultat du paiement. Elles incluent un petit script JavaScript pour lire l\'ID de transaction (et le statut pour cancel/pending) depuis les paramètres de l\'URL et l\'afficher. Intègrent également Bootstrap, Roboto, icônes et styles améliorés. Le lien "Retour à l\'accueil" pointe vers `http://localhost:5500/fedapay-frontend/index.html`.

## Flux de Paiement

Voici une illustration textuelle simplifiée du flux :

```
+-------------+      Requête POST /create-payment      +------------+      API Call Transaction.create()      +--------+
|             | -----------------------------------> |            | ---------------------------------> |        |
|   Frontend  |                                      |   Backend  |                                    | FedaPay|
| (Browser)   |      Redirection vers paymentUrl     | (Express)  | <--------------------------------- |        |
|             | <----------------------------------- |            |      Réponse paymentUrl (Token)    |        |
+-------------+                                      +------------+                                    +--------+
       |                                                                                                     |
       |   Interaction Utilisateur sur page FedaPay                                                        |
       |                                                                                                     |
       |                      Redirection GET vers callback_url (http://localhost:3000/payment-callback)    |
       +-----------------------------------------------------------------------------------------------------+
                                       |
                                       | Réception Callback
                                       | Backend vérifie Transaction.retrieve()
                                       |
                                       | Logique Métier
                                       |
                                       | Redirection GET vers page Frontend (ex: http://localhost:5500/fedapay-frontend/success.html)
                                       +---------------------------------------------------------------------+
                                                                                                             |
                                                                                                             |
                                       +------------+      Requête POST /fedapay-webhook (Async)         +--------+
                                       |            | <------------------------------------------------- |        |
                                       |   Backend  |                                                    | FedaPay|
                                       | (Express)  | Réception Webhook, Vérification Signature, Traitement |        |
                                       |            | -------------------------------------------------> |        |
                                       +------------+      Réponse HTTP 200 (Accusé de réception)         +--------+
```

*   **Flux Synchrone (Callback) :** L\'utilisateur est activement impliqué. Son navigateur est redirigé par FedaPay vers votre backend (`callback_url`), puis par votre backend vers votre frontend (pages de résultat). Ce flux donne un retour immédiat à l\'utilisateur mais peut être interrompu si l\'utilisateur ferme le navigateur.
*   **Flux Asynchrone (Webhook) :** Communication directe de serveur à serveur entre FedaPay et votre backend (`fedapay-webhook`). FedaPay envoie des notifications en tâche de fond. Ce flux est crucial pour une mise à jour fiable de l\'état des transactions, indépendamment de l\'utilisateur.

## Améliorations UI/UX

Les fichiers du frontend ont été améliorés pour offrir une meilleure expérience utilisateur en intégrant :

*   **Bootstrap 5 :** Pour un design responsive et l\'utilisation de composants stylisés (cartes, formulaires, boutons).
*   **Police Roboto :** Pour une typographie moderne et lisible.
*   **Icônes Bootstrap Icons :** Ajout d\'icônes pour améliorer la compréhension visuelle.
*   **Styles CSS Personnalisés :**
    *   Gradients subtils en arrière-plan pour une harmonie visuelle.
    *   Améliorations des cartes (ombres portées, coins arrondis).
    *   Styles cohérents pour les éléments de formulaire et les boutons.
    *   Couleurs d\'alerte standardisées pour les messages de succès/erreur/attente.
*   **Animations subtiles :** Animations (fadeIn, bounceIn, shake, pulse) pour rendre l\'interface plus dynamique et engageante, sans être intrusive.
*   **Structure Modulaire :** Le code est organisé pour faciliter les modifications et les itérations futures.

## Résolution des Problèmes Rencontrés

Durant le développement, nous avons rencontré et résolu plusieurs défis :

1.  **`TypeError: Failed to fetch` (Frontend vers Backend)**
    *   **Cause :** Politique de sécurité CORS du navigateur bloquant les requêtes du frontend (ex: http://localhost:5500) vers le backend (http://localhost:3000) car considérées comme des origines différentes.
    *   **Solution :** Installation et utilisation du middleware `cors` dans le backend Express pour autoriser explicitement les requêtes cross-origin.
    *   **BSAGF :** Toujours anticiper les problèmes de CORS en développement d\'architectures distribuées et utiliser des solutions standard comme le middleware `cors`.

2.  **`Cannot GET /payment-callback` sur l\'adresse du Frontend**
    *   **Cause :** L\'`callback_url` envoyée à FedaPay dans la requête de création de transaction pointait vers l\'URL du frontend (ex: `http://localhost:5500/payment-callback`) au lieu du backend (http://localhost:3000/payment-callback`). FedaPay redirigeait donc le navigateur vers le serveur frontend qui ne connaissait pas cette route.
    *   **Solution :** Correction dans `fedapay-frontend/index.html` pour que `callback_url_from_frontend` soit fixé à `'http://localhost:3000/payment-callback'`, assurant que FedaPay redirige vers le backend.
    *   **BSAGF :** Comprendre la distinction entre l\'URL de callback (où FedaPay redirige) et les URLs de redirection finales après traitement du callback (où votre backend redirige l\'utilisateur vers votre frontend).

3.  **`Webhook signature verification failed` (Backend)**
    *   **Cause :** Non-correspondance exacte entre le "Secret du point de terminaison" configuré pour le webhook dans le dashboard FedaPay et la valeur de la variable `endpointSecret` dans `fedapay-express-backend/server.js`. FedaPay envoie une signature basée sur ce secret, et votre backend échoue à la vérifier si le secret utilisé localement est différent.
    *   **Solution :** Vérification **extrêmement minutieuse** de la valeur du "Secret du point de terminaison" dans le dashboard FedaPay (section Webhooks, spécifique au webhook configuré) et copier/coller exact de cette valeur dans `server.js`, suivi d\'un redémarrage du serveur backend.
    *   **BSAGF :** Le secret de webhook est différent de la clé API secrète et doit être copié avec une précision absolue. Les erreurs de signature sont la plupart du temps dues à cette non-correspondance. Les webhooks sont asynchrones et réessayés par FedaPay.

4.  **`Transaction échouée` / `TIMEOUT` sur la page de paiement FedaPay**
    *   **Cause :** Problèmes ou limitations dans le simulateur Mobile Money de FedaPay en mode sandbox lors de la tentative de transaction avec un numéro non reconnu ou si le processus de simulation rencontre un accroc (ex: attente d\'une action utilisateur non simulée, problème temporaire).
    *   **Solution :** Utilisation des **numéros de test Mobile Money spécifiques documentés par FedaPay** ou, si non documentés, utilisation des numéros de **carte de test** dont le comportement (succès/échec) est fiable en sandbox pour valider le flux complet (callback et webhook) indépendamment du mode de paiement.
    *   **BSAGF :** Toujours se référer aux données de test spécifiques fournies par la passerelle de paiement pour chaque méthode de paiement afin de garantir la simulation des scénarios désirés en sandbox. Les problèmes observés sur la page de paiement FedaPay sont souvent liés à FedaPay ou aux simulateurs, pas à votre code d\'intégration initial.

5.  **`Impossible d\'obtenir /pending.html` (Frontend)**
    *   **Cause :** L\'URL de redirection générée par le backend (`http://localhost:5500/pending.html`) ne correspondait pas au chemin réel des fichiers HTML servi par le serveur frontend (Live Server), qui servait le répertoire parent comme racine, rendant le fichier accessible via `/fedapay-frontend/pending.html`.
    *   **Solution :** Correction des URLs de redirection dans la route `/payment-callback` du backend (`server.js`) pour inclure le sous-chemin `/fedapay-frontend/`. S\'assurer également que le serveur frontend (Live Server) est actif et a pris en compte la présence de `pending.html`.
    *   **BSAGF :** La configuration du serveur web local servant le frontend doit être alignée avec les URLs de redirection utilisées par le backend. Comprendre comment le serveur local sert les fichiers est clé.

## Numéros et Données de Test FedaPay (Sandbox)

Pour tester votre intégration en mode Sandbox, utilisez les données de test suivantes (issues de la documentation FedaPay) :

*   **Numéros de téléphone Mobile Money (MOOV Bénin) :**
    *   `64000001` : Simule un **Succès**.
    *   `64000000` : Simule un **Échec**.

*   **Numéros de carte de test :**
    *   `4111111111111111` (Visa) : Simule un **Succès**.
    *   `5555555555554444` (Mastercard) : Simule un **Succès**.
    *   `4242424242424241` (Visa) : Simule un **Échec**.
    *   `4242424242424242` (Visa) : Simule un **Échec**.
    *   *Pour les cartes, utilisez une date d\'expiration future et un CVC/nom fictif.*

## Lancement du Projet

Pour démarrer l\'application de test :

1.  **Démarrez le serveur backend Express :**
    Ouvrez un terminal, naviguez jusqu\'au répertoire `fedapay-express-backend/` et exécutez :
    ```bash
    node server.js
    ```
    Laissez ce terminal ouvert.

2.  **Démarrez le serveur frontend :**
    Ouvrez votre éditeur de code (VS Code recommandé). Naviguez vers le répertoire `fedapay-frontend/`. Si vous utilisez l\'extension Live Server, faites un clic droit sur `index.html` et sélectionnez "Open with Live Server". Assurez-vous que Live Server sert le répertoire parent (`/home/jack-josias/sys/systemd/sysctl/sysstat/config/linux/Fedapay Fo Charly/`) comme racine, afin que les URLs comme `/fedapay-frontend/index.html` fonctionnent.
    Votre navigateur devrait s\'ouvrir sur une URL similaire à `http://127.0.0.1:5500/fedapay-frontend/index.html`.

3.  **Testez les paiements :**
    Utilisez le formulaire sur `index.html`. Pour tester les différents scénarios (succès, échec, pending), utilisez les numéros de test FedaPay sur la page de paiement FedaPay vers laquelle vous serez redirigé. Observez les redirections dans votre navigateur et les logs dans le terminal de votre backend.

4.  **Testez les Webhooks :**
    Assurez-vous que ngrok est lancé et expose votre port backend (3000), et que l\'URL HTTPS de ngrok + `/fedapay-webhook` est configurée dans votre dashboard FedaPay avec le bon secret. Déclenchez de nouvelles transactions et observez les logs de réception de webhook dans le terminal de votre backend. Si la vérification de signature réussit, vous verrez les logs `Webhook reçu: ...` sans les messages d\'erreur.

## Conclusion et Perspectives

Vous avez maintenant une architecture de test complète et fonctionnelle pour l\'intégration FedaPay en mode sandbox. Vous avez acquis une compréhension approfondie du flux de paiement, de la gestion des callbacks et des webhooks, ainsi que des pièges courants et de leurs solutions.

Les prochaines étapes pourraient inclure :

*   Implémenter une logique métier plus poussée dans les gestionnaires de callback et de webhook (par exemple, mise à jour d\'une base de données de commandes).
*   Gérer d\'autres types d\'événements webhook pertinents.
*   Ajouter une gestion plus robuste des erreurs et des validations.
*   Préparer le passage en mode Live (en remplaçant les clés API et le secret du webhook par les versions live, et en utilisant un serveur accessible publiquement avec HTTPS valide pour la production).

Ce `README.md` devrait vous servir de référence solide pour revisiter ce projet à tout moment.


---
Document généré le 12 juin 2025 dans le cadre d\'une session de développement guidée.

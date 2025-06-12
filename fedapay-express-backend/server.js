// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Importation du middleware cors
const { FedaPay, Transaction, Customer, Webhook } = require('fedapay');

const app = express();
const port = process.env.PORT || 3000; // Utilisez une variable d'environnement pour le port

// --- Configuration FedaPay ---
// Remplacez par VOTRE_CLE_API_SECRETE de TEST
const FEDAPAY_SECRET_KEY = "sk_sandbox_ZVJnpqyFJJXWxBY_j3MvnurJ"; // IMPORTANT: Utilisez votre clé secrète de TEST
const FEDAPAY_ENVIRONMENT = 'sandbox'; // ou 'live' en production

FedaPay.setApiKey(FEDAPAY_SECRET_KEY);
FedaPay.setEnvironment(FEDAPAY_ENVIRONMENT);
/*
* Référence pour setApiKey et setEnvironment:
* https://docs.fedapay.com/integration-api/fr/customer-management-fr (Exemple de requête API > NodeJs)
* https://docs.fedapay.com/integration-api/fr/authentication-fr (section "Obtenir vos clés API")
*/

// --- Middlewares ---
// Pour parser les requêtes JSON du frontend
app.use(express.json());
// Pour parser les requêtes URL-encoded (si besoin)
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // Utilisation du middleware cors pour autoriser les requêtes cross-origin

// --- Routes ---

// Route pour créer une transaction de collecte
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
            callback_url: callback_url_from_frontend, // URL de callback fournie par le frontend (ou une URL fixe de votre backend)
            customer: {
                firstname: customer_firstname || 'PrénomTest',
                lastname: customer_lastname || 'NomTest',
                email: customer_email,
                // phone_number: { number: '+22997000000', country: 'bj' } // Optionnel
            }
        };
        /*
        * Référence pour la création de transaction:
        * https://docs.fedapay.com/integration-api/fr/collects-management-fr (section "Initialisation de la Collecte : Création d'une Requête")
        * L'exemple Curl montre la structure du payload. La librairie Node.js suit cette structure.
        */

        const transaction = await Transaction.create(transactionData);
        /*
        * Référence pour Transaction.create():
        * Implicitement basé sur l'exemple NodeJs pour Customer.create() dans https://docs.fedapay.com/integration-api/fr/customer-management-fr
        * et la structure de la requête de création de collecte.
        */

        const tokenObject = await transaction.generateToken();
        /*
        * Référence pour transaction.generateToken():
        * https://docs.fedapay.com/integration-api/fr/collects-management-fr (section "Génération du Token et du Lien de Paiement")
        * L'exemple cURL montre l'appel à /transactions/ID/token. La méthode SDK fait cela.
        */

        res.json({ paymentUrl: tokenObject.url });

    } catch (error) {
        console.error('Erreur lors de la création de la transaction FedaPay:', error);
        res.status(500).json({ error: error.message || 'Erreur serveur lors de la création du paiement.' });
    }
});

// Route pour gérer le callback FedaPay (après que l'utilisateur ait payé ou annulé)
app.get('/payment-callback', async (req, res) => {
    const transactionId = req.query.id;
    const statusFromUrl = req.query.status; // ex: 'approved', 'canceled'

    /*
    * Référence pour le callback_url et les paramètres reçus:
    * https://docs.fedapay.com/integration-api/fr/collects-management-fr (section "Utilisation du Lien de Retour (Callback URL)")
    */

    if (!transactionId) {
        return res.status(400).send('ID de transaction manquant dans le callback.');
    }

    try {
        // ATTENTION: Vérifiez TOUJOURS le statut réel de la transaction auprès de l'API FedaPay.
        // Ne vous fiez pas uniquement au statut dans l'URL.
        const transaction = await Transaction.retrieve(transactionId);
        /*
        * Référence pour Transaction.retrieve():
        * https://docs.fedapay.com/integration-api/fr/collects-management-fr (section "Récupération des Détails d’une Collecte", exemple cURL, la méthode SDK fait l'équivalent)
        */

        const actualStatus = transaction.status;
        console.log(`Callback reçu pour transaction ${transactionId}. Statut URL: ${statusFromUrl}, Statut API: ${actualStatus}`);

        // Logique métier ici :
        // - Mettre à jour votre base de données avec le statut réel.
        // - Envoyer un email de confirmation, etc.

        if (actualStatus === 'approved') {
            // Rediriger vers une page de succès sur votre frontend
            res.redirect(`http://localhost:5500/fedapay-frontend/success.html?transaction_id=${transactionId}`); // Adaptez l'URL du frontend
        } else if (actualStatus === 'canceled' || actualStatus === 'declined') {
            // Rediriger vers une page d'échec/annulation sur votre frontend
            res.redirect(`http://localhost:5500/fedapay-frontend/cancel.html?transaction_id=${transactionId}&status=${actualStatus}`); // Adaptez l'URL du frontend
        } else {
            // Gérer d'autres statuts si nécessaire
            res.redirect(`http://localhost:5500/fedapay-frontend/pending.html?transaction_id=${transactionId}&status=${actualStatus}`); // Adaptez l'URL du frontend
        }

    } catch (error) {
        console.error('Erreur lors de la vérification du callback FedaPay:', error);
        res.status(500).send('Erreur serveur lors du traitement du callback.');
    }
});





















// Route pour gérer les webhooks FedaPay
// IMPORTANT: Cette route doit parser le corps de la requête en 'raw' pour la vérification de la signature.
app.post('/fedapay-webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-fedapay-signature'];
    // Remplacez par le secret de VOTRE point de terminaison webhook configuré dans le dashboard FedaPay (mode test)
    const endpointSecret = 'wh_sandbox_gVrxeO8yFilFZgDJrNa-GkJu'; // Ce secret est différent de votre clé API secrète.
                                                                // Vous l'obtenez lors de la création du webhook dans votre dashboard FedaPay.
    /*
    * Référence pour la configuration des webhooks et la signature:
    * https://docs.fedapay.com/integration-api/fr/webhooks-fr (sections "Configuration des Webhooks", "Vérifier que les événements sont envoyés par FedaPay", "Comment vérifier les signatures des webhooks ?")
    */

    let event;

    try {
        event = Webhook.constructEvent(req.body, signature, endpointSecret);
        /*
        * Référence pour Webhook.constructEvent():
        * https://docs.fedapay.com/integration-api/fr/webhooks-fr (Exemple NodeJs dans "Outils pour vérifier les signatures")
        */
    } catch (err) {
        console.error(`⚠️  Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Gérer l'événement
    console.log('Webhook reçu:', event.name, event.data.object);
    switch (event.name) {
        case 'transaction.approved':
            const transactionApproved = event.data.object;
            console.log(`Transaction approuvée par webhook: ${transactionApproved.id}, Statut: ${transactionApproved.status}`);
            // Logique métier: Confirmer la commande, donner accès au service, etc.
            // C'est une confirmation serveur-à-serveur, plus fiable que le callback seul.
            break;
        case 'transaction.canceled':
            const transactionCanceled = event.data.object;
            console.log(`Transaction annulée par webhook: ${transactionCanceled.id}, Statut: ${transactionCanceled.status}`);
            // Logique métier: Annuler la commande, etc.
            break;
        case 'transaction.declined':
            const transactionDeclined = event.data.object;
            console.log(`Transaction déclinée par webhook: ${transactionDeclined.id}, Statut: ${transactionDeclined.status}`);
            // Logique métier: Informer l'utilisateur, etc.
            break;
        // Ajoutez d'autres cas d'événements que vous souhaitez gérer
        // Voir la liste des événements dans la documentation:
        // https://docs.fedapay.com/integration-api/fr/webhooks-fr (sections "Cycle de vie des transactions", "Cycle de vie des clients")
        default:
            console.log(`Unhandled event type ${event.name}`);
    }

    // Renvoyer une réponse 2xx pour accuser réception de l'événement
    res.status(200).json({ received: true });
    /*
    * Référence pour la réponse 2xx:
    * https://docs.fedapay.com/integration-api/fr/webhooks-fr (section "Stratégie d’envoi des événements des Webhooks")
    */
});


// Démarrer le serveur
app.listen(port, () => {
    console.log(`Serveur Express.js écoutant sur http://localhost:${port}`);
    console.log(`Assurez-vous que FedaPay est configuré pour l'environnement: ${FEDAPAY_ENVIRONMENT}`);
});

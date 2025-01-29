// import dotenv from "dotenv";
// import promptSync from "prompt-sync";
// import { TelegramClient } from "telegram";
// import { NewMessage } from "telegram/events";
// import { StringSession } from "telegram/sessions";

// dotenv.config();

// const prompt = promptSync({ sigint: true });

// export interface TokenLaunch {
//   tokenAddress: string;
//   messageUrl: string;
//   timestamp: string;
// }

// export class TelegramMonitor {
//   private client: TelegramClient;
//   private botStartTime: Date;

//   constructor() {
//     if (!process.env.TELEGRAM_API_ID || !process.env.TELEGRAM_API_HASH) {
//       throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
//     }
//     this.botStartTime = new Date();

//     const apiId = parseInt(process.env.TELEGRAM_API_ID);
//     const apiHash = process.env.TELEGRAM_API_HASH;

//     // Utiliser une session stockée si disponible
//     const sessionString = process.env.TELEGRAM_SESSION;
//     this.client = new TelegramClient(
//       new StringSession(sessionString),
//       apiId,
//       apiHash,
//       {
//         connectionRetries: 5,
//       }
//     );
//   }

//   async connect() {
//     // Se connecter en tant qu'utilisateur
//     await this.client.start({
//       phoneNumber: async () => prompt("Numéro de téléphone ? "),
//       password: async () => prompt("Mot de passe ? "),
//       phoneCode: async () => prompt("Code reçu ? "),
//       onError: (err) => console.log(err),
//     });

//     // Sauvegarder la session pour une utilisation ultérieure
//     console.log("Session string à sauvegarder:", this.client.session.save());
//   }

//   async startMonitoring(
//     channelUsername: string,
//     callback: {
//       onNewLaunch: (message: string) => void;
//     }
//   ) {
//     console.log(`Démarrage du monitoring pour ${channelUsername}`);

//     try {
//       // S'assurer que le client est connecté
//       if (!this.client.connected) {
//         console.log("Client non connecté, tentative de connexion...");
//         await this.client.connect();
//         console.log("Client connecté avec succès");
//       }

//       console.log("État de la connexion:", this.client.connected);

//       // Vérifier si le canal existe et est accessible
//       try {
//         const channel = await this.client.getEntity(channelUsername);
//         console.log("Canal trouvé:", channel.id);
//       } catch (e) {
//         console.error("Erreur lors de l'accès au canal:", e);
//       }

//       this.client.addEventHandler(async (event: any) => {
//         const message = event.message;
//         if (!message) {
//           console.log("Pas de message dans l'événement");
//           return;
//         }

//         if (!message.text) {
//           console.log("Message sans texte:", message);
//           return;
//         }

//         try {
//           callback.onNewLaunch(message.text);
//         } catch (error) {
//           console.error("Erreur lors du traitement du message:", error);
//         }
//       }, new NewMessage({ chats: [channelUsername] }));

//       console.log("Handler d'événements ajouté avec succès");
//     } catch (error) {
//       console.error("Erreur lors du démarrage du monitoring:", error);
//     }
//   }

//   static async generateNewSession() {
//     // Supprimer la session existante
//     const client = new TelegramClient(
//       new StringSession(""),
//       parseInt(process.env.TELEGRAM_API_ID || ""),
//       process.env.TELEGRAM_API_HASH || "",
//       {
//         connectionRetries: 5,
//       }
//     );

//     // Se connecter en tant qu'utilisateur
//     await client.start({
//       phoneNumber: async () => prompt("Numéro de téléphone ? "),
//       password: async () => prompt("Mot de passe ? "),
//       phoneCode: async () => prompt("Code reçu ? "),
//       onError: (err) => console.log(err),
//     });

//     // Sauvegarder la nouvelle session pour une utilisation ultérieure
//     console.log(
//       "Nouvelle session string à sauvegarder:",
//       client.session.save()
//     );
//   }
// }

// const telegramMonitor = new TelegramMonitor();
// telegramMonitor.startMonitoring("testcalldegen", {
//   onNewLaunch: (message: string) => {
//     console.log("Nouveau message:", message);
//   },
// });

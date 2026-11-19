# Gemini-helper

[![GitHub](https://img.shields.io/badge/GitHub-urzeye%2Ftampermonkey--scripts-blue?style=flat-square&logo=github)](https://github.com/urzeye/tampermonkey-scripts)

> [!CAUTION]
> **Arrêt des mises à jour fonctionnelles de Gemini Helper**
>
> Ce projet a été refondu sous le nom d'**[Ophel](https://github.com/urzeye/ophel)** —— entièrement réécrit avec une pile technologique moderne, offrant de meilleures performances et plus de fonctionnalités. Compatible avec les extensions de navigateur et les Userscripts.
>
> Nous vous recommandons vivement de migrer vers **Ophel** pour une expérience optimale :
>
> - [Dépôt GitHub](https://github.com/urzeye/ophel)
> - [Chrome](https://chromewebstore.google.com/detail/ophel-ai-%E5%AF%B9%E8%AF%9D%E5%A2%9E%E5%BC%BA%E5%B7%A5%E5%85%B7/lpcohdfbomkgepfladogodgeoppclakd)
> - [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/ophel-ai-chat-enhancer)
> - [Installation GreasyFork](https://greasyfork.org/zh-CN/scripts/563646-ophel)
>
> Ce script ne fera l'objet que d'une maintenance de base.

<p align="center">
  <strong>✨ Your Gemini, Your Way. ✨</strong><br/>
  <em>Créez votre Gemini personnalisé</em>
</p>

> [!TIP]
> **Gemini Helper** : Gestion et export des conversations, navigation par plan, gestion des prompts, améliorations des onglets (statut/confidentialité/notification), historique de lecture et restauration, ancre bidirectionnelle/manuelle, suppression du filigrane, correction du gras, copie formule/tableau, verrouillage de modèle, embellissement de page, changement de thème, mode sombre intelligent (Gemini/Gemini Enterprise)

🌐 **Langue**: [简体中文](README.md) | [English](README_EN.md) | [日本語](README_JA.md) | [한국어](README_KO.md) | [Deutsch](README_DE.md) | **Français** | [Español](README_ES.md) | [Português](README_PT.md) | [Русский](README_RU.md)

## ✨ Fonctionnalités

### 📝 Gestion des Prompts

- **Insertion rapide** : Insérer en un clic les prompts fréquemment utilisés dans le chat
- **Gestion des catégories** : Filtrer, renommer et supprimer les catégories
- **Fonction de recherche** : Trouver rapidement les prompts dont vous avez besoin
- **Opérations CRUD** : Personnaliser et gérer votre bibliothèque de prompts
- **Fonction de copie** : Copier en un clic le contenu du prompt dans le presse-papiers
- **Glisser & Trier** : Ajuster librement l'ordre d'affichage des prompts

### 📁 Gestion des Conversations

- **Archive de dossiers** : Créer des dossiers personnalisés pour organiser l'historique des chats
- **Tags multicolores** : Plus de 30 couleurs traditionnelles chinoises, prend en charge les couleurs personnalisées et la gestion multi-tags
- **Recherche en temps réel** : Filtre rapide par titre, prend en charge le filtrage par combinaison de tags
- **Opérations par lots** : Multi-sélection pour suppression, déplacement et archivage en masse
- **Export de conversation** : Export au format Markdown/JSON/TXT, images convertibles en Base64
- **Synchronisation fluide** : Synchronisation automatique des dernières données depuis la barre latérale Gemini (compatible Standard/Enterprise)

### 📑 Navigation par Plan

- **Extraction automatique** : Extraire la structure des titres des réponses IA (prend en charge Standard et Enterprise Shadow DOM)
- **Groupement des requêtes utilisateur** : Grouper le plan par tours de conversation, requêtes utilisateur comme en-têtes de groupe (icône 💬)
- **Indentation intelligente** : Ajustement automatique de l'indentation selon le niveau le plus élevé pour réduire l'espace blanc à gauche
- **Saut rapide** : Cliquer sur un élément du plan pour défiler en douceur et mettre en surbrillance pendant 2 secondes
- **Défilement synchronisé** : Mise en surbrillance automatique de l'élément du plan correspondant lors du défilement de la page (basculable dans les paramètres)
- **Filtre de niveau** : Définir l'affichage du niveau de titre, Niveau 0 pour replier rapidement aux requêtes utilisateur uniquement
- **Contrôle de bascule** : Masquage automatique de l'onglet plan lors de la désactivation

### 🚀 Navigation Rapide

- **Aller en haut/bas** : Positionnement rapide dans les longues conversations
- **Groupe de boutons flottants** : Accessible même lorsque le panneau est replié

### 📐 Largeur de Page

- **Largeur personnalisée** : Prend en charge les unités pixels (px) et pourcentage (%)
- **Application instantanée** : Appliquer immédiatement après ajustement, pas de rafraîchissement nécessaire
- **Configuration indépendante** : Paramètres différents pour différents sites

### ⚓ Système de Positionnement Intelligent

Deux systèmes d'enregistrement de position indépendants :

- **Historique de lecture (Reading Progress)** :
  - "Mémoire de progression de lecture" à long terme, prend en charge la restauration inter-rafraîchissement/session
  - Enregistrement automatique lors du défilement, persisté dans GM_storage
  - Restauration automatique au chargement de la page ou changement de conversation

- **Ancre Bidirectionnelle** :
  - "Point de retour" à court terme, similaire au retour du navigateur ou `git switch -`
  - Sauvegarde automatique de la position actuelle lors du clic sur les boutons plan/haut/bas
  - Prend en charge le basculement aller-retour entre deux positions

### 🏷️ Améliorations des Onglets

- **Affichage du statut de génération** : Affichage automatique de l'icône ⏳ (génération) ou ✅ (terminé) dans le titre de l'onglet
- **Format de titre personnalisé** : Prend en charge les combinaisons de placeholder `{status}{title}[{model}]`
- **Mode Confidentialité (Touche Boss)** : Déguiser en un clic le titre de l'onglet en "Google", masquer le contenu de la conversation
- **Notification de fin** : Envoyer une notification bureau lorsque la génération en arrière-plan est terminée
- **Focus automatique de fenêtre** : Ramener automatiquement la fenêtre du navigateur au premier plan lorsque la génération est terminée

### ⚙️ Panneau de Paramètres

- **Changement d'onglet** : Trois onglets - Prompts, Plan, Paramètres
- **Paramètres du panneau** : Personnaliser le déploiement/repliement par défaut, masquage automatique au clic extérieur
- **Correction de saisie chinoise** : Bascule optionnelle pour corriger le problème du premier caractère en Enterprise
- **Changement de langue** : Prend en charge Chinois simplifié/Chinois traditionnel/Anglais

### 🎯 Adaptation Intelligente

- ✅ Gemini Standard (gemini.google.com)
- ✅ Gemini Enterprise (business.gemini.google)

### 🌓 Mode Sombre Automatique

- **Détection intelligente** : Suivi en temps réel du basculement mode clair/sombre du système/page
- **Adaptation complète** : Schéma de couleurs du thème sombre soigneusement ajusté, confortable pour les yeux

### 📋 Assistance au Contenu

- **Copie formule par double-clic** : Double-cliquer sur une formule mathématique pour copier la source LaTeX, ajout automatique des délimiteurs
- **Copie tableau Markdown** : Ajouter un bouton de copie en haut à droite du tableau, copie directe au format Markdown
- **Suppression de filigrane** : Suppression automatique du filigrane NanoBanana des images générées par Gemini AI
- **Accrochage aux bords** : Masquage automatique lors du glissement du panneau vers le bord de l'écran, affichage au survol
- **Ancre manuelle** : Définir/retourner/effacer la position d'ancre avec la barre d'outils rapide

## 📸 Aperçu

**📹 Démo Vidéo**:

| Plan | Conversations | Fonctionnalités |
|:---:|:---:|:---:|
| <video src="https://github.com/user-attachments/assets/a40eb655-295e-4f9c-b432-9313c9242c9d" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/a249baeb-2e82-4677-847c-2ff584c3f56b" width="280" controls></video> | <video src="https://github.com/user-attachments/assets/c704463c-1ca9-4ab1-937d-7ce638a4f4bb" width="280" controls></video> |

 ![Conversations](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-7.png) ![Conversations](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-8.png) ![Plan](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-2.png) ![Prompts](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-1.png) ![Navigation de lecture](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-3.png) ![Amélioration des onglets](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-4.png) ![Changement de thème](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-theme.gif) ![Mode sombre](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-9.png) ![Mode sombre](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-10.png) ![Mode sombre](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-11.png) ![Mode sombre](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-12.png) ![Autres paramètres](https://raw.githubusercontent.com/urzeye/tampermonkey-scripts/refs/heads/main/gemini-helper/images/gemini-helper-5.png)

## 🔧 Utilisation

1. Installer l'extension de navigateur Tampermonkey
2. Installer ce script
3. Ouvrir la page Gemini, le panneau de gestion des prompts apparaît sur le côté droit
4. Cliquer sur un prompt pour l'insérer rapidement

## ⌨️ Opérations Rapides

| Opération | Description |
| --- | --- |
| Cliquer sur prompt | Insérer dans la zone de saisie |
| 📋 Bouton copier | Copier le contenu du prompt |
| ☰ Poignée de glissement | Glisser pour ajuster l'ordre |
| ✏ Bouton éditer | Éditer le prompt |
| 🗑 Bouton supprimer | Supprimer le prompt |
| ⚙ Gestion des catégories | Renommer/supprimer la catégorie |
| Cliquer bouton × | Effacer le contenu inséré |
| Entrée pour envoyer | Masquer automatiquement la barre flottante |
| Boutons ⬆ / ⬇ | Aller en haut/bas de la page |

## 🐛 Retours

Pour les problèmes ou suggestions, veuillez donner vos retours sur [GitHub Issues](https://github.com/urzeye/tampermonkey-scripts/issues)

## 📄 Licence

MIT License

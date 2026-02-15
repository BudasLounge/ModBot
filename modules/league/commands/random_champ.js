module.exports = {
    name: 'rando',
    description: 'returns a random league champion.',
    syntax: 'rando [role]or[@discord_name]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var roles = ["mid", "top", "adc", "sup", "jg"];
        this.logger.info("[rando] Execute called", { userId: message.member?.id, argsLength: args.length });
        if (args[1]) {
        this.logger.info("[rando] Primary argument detected", { arg1: args[1] });
        if (args[1].includes("@")) {
            var respChampsCustom;
            var mentionUser = message.mentions.users.first();
            if (!mentionUser) {
                message.channel.send({ content: "Please @mention a valid user." });
                return;
            }
            var customID = mentionUser.id;
            try {
            respChampsCustom = await api.get("league_pref_champ", {
                _limit: 200,
                user_id: customID,
            });
            } catch (errorCustom) {
            this.logger.error("[rando] Failed fetching custom list", { error: errorCustom?.response || errorCustom?.message || errorCustom });
            message.channel.send({ content: "I couldn't fetch that user's approved champions right now." });
            return;
            }
            if (respChampsCustom && respChampsCustom.league_pref_champs && respChampsCustom.league_pref_champs[0]) {
            if (!args[2]) {
                this.logger.info("[rando] Selecting from custom champion pool", { count: respChampsCustom.league_pref_champs.length });
                var seedCustom = Math.floor(Math.random() * respChampsCustom.league_pref_champs.length);
                message.channel.send({
                content: "<@" + message.member.id + "> " + "Your champ is: " + respChampsCustom.league_pref_champs[seedCustom].champ_name,
                });
            } else if (roles.includes(args[2])) {
                this.logger.info("[rando] Filtering custom pool by role", { role: args[2], totalCustom: respChampsCustom.league_pref_champs.length });
                var champs = [];
                for (var i = 0; i < respChampsCustom.league_pref_champs.length; i++) {
                this.logger.info("[rando] Checking custom champion role", { champ: respChampsCustom.league_pref_champs[i].champ_name, role: args[2] });
                var respChamps;
                try {
                    respChamps = await api.get("league_champion", {
                    name: respChampsCustom.league_pref_champs[i].champ_name,
                    role_primary: args[2],
                    });
                } catch (error2) {
                    this.logger.error("[rando] Failed role lookup", { error: error2?.response || error2?.message || error2 });
                    continue;
                }
                if (respChamps && respChamps.league_champions && respChamps.league_champions[0]) {
                    this.logger.info("[rando] Found role-compatible champion", { champ: respChamps.league_champions[0].name });
                    champs.push(respChamps.league_champions[0]);
                }
                }
                if (!champs.length) {
                    message.channel.send({ content: "No approved champions matched that role." });
                    return;
                }
                this.logger.info("[rando] Built filtered custom pool", { count: champs.length });
                var seedCustom = Math.floor(Math.random() * champs.length);
                this.logger.info("[rando] Selected random index", { seed: seedCustom, max: champs.length });
                message.channel.send({
                content: "<@" + message.member.id + "> " + "Your champ is: " + champs[seedCustom].name,
                });
            } else {
                message.channel.send({ content: "That role doesn't exist! Try:\nmid, top, sup, adc, jg" });
            }
            } else {
            message.channel.send({ content: "That person hasn't approved any champions yet!" });
            }
        } else if (args[1] === "ad" || args[1] === "ap") {
            var respChampsAd;
            try {
            respChampsAd = await api.get("league_champion", {
                _limit: 200,
                ad_ap: args[1],
            });
            } catch (errorAd) {
            this.logger.error("[rando] Failed AD/AP lookup", { error: errorAd?.response || errorAd?.message || errorAd });
            message.channel.send({ content: "I couldn't fetch champions right now." });
            return;
            }
            if (!respChampsAd || !respChampsAd.league_champions || !respChampsAd.league_champions.length) {
                message.channel.send({ content: "No champions found for that damage type." });
                return;
            }
            var seedAd = Math.floor(Math.random() * respChampsAd.league_champions.length);
            message.channel.send({
            content: "<@" + message.member.id + "> " + "Your " + args[1].toUpperCase() + " champ is: " + respChampsAd.league_champions[seedAd].name,
            });
        } else if (roles.includes(args[1])) {
            try {
            var [respChampsPrim, respChampsSec] = await Promise.all([
                api.get("league_champion", {
                _limit: 200,
                role_primary: args[1],
                }),
                api.get("league_champion", {
                _limit: 200,
                role_secondary: args[1],
                }),
            ]);
            } catch (error) {
            this.logger.error("[rando] Failed role lookup", { error: error?.response || error?.message || error });
            message.channel.send({ content: "I couldn't fetch champions right now." });
            return;
            }
            const respChamps = [
                ...respChampsPrim.league_champions,
                ...respChampsSec.league_champions,
                ...respChampsPrim.league_champions,
                ...respChampsPrim.league_champions,
            ];
            if (!respChamps.length) {
                message.channel.send({ content: "No champions found for that role." });
                return;
            }
            var seed = Math.floor(Math.random() * respChamps.length);
            message.channel.send({
            content: "<@" + message.member.id + "> " + "Your " + args[1] + " champ is: " + respChamps[seed].name,
            });
        } else {
            message.channel.send({ content: "That role doesn't exist! Try:\nmid, top, sup, adc, jg" });
        }
        } else {
        try {
            var respAllChamps = await api.get("league_champion", {
            _limit: 200,
            });
        } catch (error) {
            this.logger.error("[rando] Failed all champion lookup", { error: error?.response || error?.message || error });
            message.channel.send({ content: "I couldn't fetch champions right now." });
            return;
        }
        if (!respAllChamps || !respAllChamps.league_champions || !respAllChamps.league_champions.length) {
            message.channel.send({ content: "No champions found." });
            return;
        }
        var seed = Math.floor(Math.random() * respAllChamps.league_champions.length);
        try {
            message.channel.send({ content: "<@" + message.member.id + "> " + respAllChamps.league_champions[seed].name });
        } catch (error2) {
            this.logger.error("[rando] Failed sending message", { error: error2?.message || error2 });
        }
        }
    }
};
// Import the cds facade object (https://cap.cloud.sap/docs/node.js/cds-facade)
const cds = require('@sap/cds')

// The service implementation with all service handlers
module.exports = cds.service.impl(async function() {

    // Define constants for the Risk and BusinessPartner entities from the risk-service.cds file
    const { Risks, BusinessPartners } = this.entities;

    // This handler will be executed directly AFTER a READ operation on RISKS
    // With this we can loop through the received data set and manipulate the single risk entries
    this.after("READ", Risks, (data) => {
        // Convert to array, if it's only a single risk, so that the code won't break here
        const risks = Array.isArray(data) ? data : [data];

        // Looping through the array of risks to set the virtual field 'criticality' that you defined in the schema
        risks.forEach((risk) => {
            if( risk.impact >= 100000) {
                risk.criticality = 1;
            } else {
                risk.criticality = 2;
            }

            // set criticality for priority
            switch (risk.prio_code) {
                case 'H':
                    risk.PrioCriticality = 1;
                    break;
                case 'M':
                    risk.PrioCriticality = 2;
                    break;
                case 'L':
                    risk.PrioCriticality = 3;
                    break;
                default:
                    break;
            }

        })
    })

    // connect to remote service
    const BPsrv = await cds.connect.to("API_BUSINESS_PARTNER");
    
    /**
     * Event-handler for read-events on the BusinessPartners entity.
     * Each request to the API Business Hub requires the apikey in the header.
     */
    this.on("READ", BusinessPartners, async (req) => {
        // The API Sandbox returns alot of business partners with empty names.
        // We don't want them in our application
        req.query.where("LastName <> '' and FirstName <> '' ");

        return await BPsrv.transaction(req).send({
            query: req.query,
            headers: {
                apikey: process.env.apikey,
            },
        });
    });


    /**
  * Event-handler on risks.
  * Retrieve BusinessPartner data from the external API
  */
    this.on("READ", Risks, async (req, next) => {
        /*
            Check whether the request wants an "expand" of the business partner
            As this is not possible, the risk entity and the business partner entity are in different systems (SAP BTP and S/4 HANA Cloud),
            if there is such an expand, remove it
            */

        if (!req.query.SELECT.columns) return next();

        const expandIndex = req.query.SELECT.columns.findIndex(
            ({ expand, ref }) => expand && ref[0] === "bp"
        );
        console.log(req.query.SELECT.columns);
        if (expandIndex < 0) return next();

        req.query.SELECT.columns.splice(expandIndex, 1);
        if (
            !req.query.SELECT.columns.find((column) =>
                column.ref.find((ref) => ref == "bp_BusinessPartner")
            )
        ) {
            req.query.SELECT.columns.push({ ref: ["bp_BusinessPartner"] });
        }

        /*
            Instead of carrying out the expand, issue a separate request for each business partner
            This code could be optimized, instead of having n requests for n business partners, just one bulk request could be created
            */
        try {
            res = await next();
            res = Array.isArray(res) ? res : [res];

            await Promise.all(
                res.map(async (risk) => {
                    const bp = await BPsrv.transaction(req).send({
                        query: SELECT.one(this.entities.BusinessPartners)
                            .where({ BusinessPartner: risk.bp_BusinessPartner })
                            .columns(["BusinessPartner", "FullName"]),
                        headers: {
                            apikey: process.env.apikey,
                        },
                    });
                    risk.bp = bp;
                })
            );
        } catch (error) { }
    });    










  });
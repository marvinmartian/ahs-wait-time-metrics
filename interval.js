const axios = require("axios");

const util = require('util')
const http = require('http')
const url = require('url')

const client = require('prom-client');
// const collectDefaultMetrics = client.collectDefaultMetrics;
const Registry = client.Registry;
const register = new Registry();
// collectDefaultMetrics({ register });

register.setDefaultLabels({
  app: 'ahs-wait-times'
})

// ##############

const interchange_stats = new client.Gauge({
    name: 'interchange',
    help: 'Interchange Actual Flow',
    labelNames: ['location']
  });
register.registerMetric(interchange_stats);

// ##############

const ahs_wait_time = new client.Gauge({
  name: 'ahs_wait_time',
  help: 'Wait Time',
  labelNames: ['category','city','hospital']
});
register.registerMetric(ahs_wait_time);

async function getWaitTimes() {
  let response = await axios( { url: "https://ahs.omgosh.org/", 
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' }});

  if (response.status) {
    try {
      var data = response.data;
      data.forEach((elem,index) => {
        ahs_wait_time.set({category: elem.category, city: elem.city, hospital: elem.hospital },elem.wait_time);
      })
    } catch (error) {
      console.error("Unable to get wait times.", error);
    }

  }
}

const server = http.createServer(async (req, res) => {
    // Retrieve route from request object
    const route = url.parse(req.url).pathname
    
    if (route === '/metrics') {
      // Return all metrics the Prometheus exposition format
      await getWaitTimes()
      res.setHeader('Content-Type', register.contentType)
      let data = await register.metrics();
      res.end(data);

    }
  })

  // Start the HTTP server which exposes the metrics on http://localhost:8080/metrics
  server.listen(8080)
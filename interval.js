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
  app: 'wait-times'
})


const ahs_wait_time = new client.Gauge({
  name: 'ahs_wait_time',
  help: 'Wait Time',
  labelNames: ['category','city', 'province', 'hospital']
});
register.registerMetric(ahs_wait_time);

const wait_time = new client.Gauge({
  name: 'wait_time',
  help: 'Wait Time',
  labelNames: ['category','city','province','hospital']
});
register.registerMetric(wait_time);

async function getWaitTimes() {
  let response = await axios( { url: "https://ahs.omgosh.org/", 
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36' }});

  if (response.status) {
    try {
      var data = response.data;
      data.forEach((elem,index) => {
        ahs_wait_time.set({category: elem.category, city: elem.city, hospital: elem.hospital, province: 'AB' },elem.wait_time);
        // ahs_wait_time.set({category: elem.category, city: elem.city, hospital: elem.hospital },elem.wait_time);
      })
    } catch (error) {
      console.error("Unable to get wait times.", error);
    }

  }

  const user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36'
  const hospital_array = [
      {id: 8285, hospital_name: 'Royal University Hospital', city: 'Saskatoon', province: 'SK'},
      {id: 8284, hospital_name: 'Jim Pattison Children\'s Hospital', city: 'Saskatoon', province: 'SK'},
      {id: 8287, hospital_name: 'St. Paul\'s Hospital', city: 'Saskatoon', province: 'SK'},
      // {id: 8308, hospital_name: 'Regina General Hospital', city: 'Regina', province: 'SK'},
      // {id: 8286, hospital_name: 'Saskatoon City Hospital', city: 'Saskatoon', province: 'SK'},
      
  ]
  // {id: 8162, hospital_name: 'Biggar & District Health Centre', city: 'Biggar'},
  // {id: 8158, hospital_name: 'Cypress Regional Hospital', city: 'Swift Current'},
  // {id: 8363, hospital_name: 'Alex Ositis Foundation', city: 'Rosetown'},

  let req_array = [];
  
  hospital_array.forEach((hospital_obj) => {
      req_array.push(axios({ url: "https://www.saskhealthauthority.ca/ajax/wait-times/" + hospital_obj.id, headers: { 'User-Agent': user_agent } }))
  })

  await axios.all(req_array).then(axios.spread((...responses) => {
    responses.forEach((hospital_response,index) => {
        // console.log(hospital_array[index].hospital_name);
        // console.log(hospital_response.data);
        wait_time.set({city: hospital_array[index].city, province: hospital_array[index].province, hospital: hospital_array[index].hospital_name },hospital_response.data.seconds);
    })
    
    
  }));
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